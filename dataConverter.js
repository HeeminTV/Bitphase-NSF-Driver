/*
   ======================================================================================================
   Copyright 2026 Heemin
   
   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
   associated documentation files (the "Software"), to deal in the Software without restriction,
   including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
   and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so.
   
   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
   LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
   IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
   WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
   ======================================================================================================
*/

// ======================================================================================================

module.exports = { convertBitphaseJsonToNSFBytecode };

// ======================================================================================================
//
// Main Conversion Function
//
// ======================================================================================================

	let i_currentAddress = 0;
	let a_byteObjList = [];
	let d_labelAddrTbl = {};
function convertBitphaseJsonToNSFBytecode(btpModule = [], i_loadAddress = 0xA000) { // btp json array -> compiled bytestream
	// validation
	if (i_loadAddress > 0xFFFF || i_loadAddress < 0x0000) throw new Error(`Load address must exist at 6502 memory range. Specified 0x${i_loadAddress.toString(16).toUpperCase()}.`);

	// Parse the pattern **first**
	// Generate linear byte command stream per each channels (no compression)
	const CHIPID_NES = 0;
	const CHIPID_AY = 1;
	const CHIPID_MMC5 = 2;
	const CHIPID_VRC7 = 3;

	const d_chipStringToID = {
		"nes": CHIPID_NES,
		"ay": CHIPID_AY,
		"mmc5": CHIPID_MMC5,
		"vrc7": CHIPID_VRC7
	}
	let a_chipsList = []; // only used to detect duplicated chips
	let a_channelList = []; /* channel stream buffers and render status
	[
	{ chipID: "0", channelID: "0", virtualID: "-1", 
	  delayCount: "64",
	  stream: [] 
	}
	]
	*/
	
	/* Bytecode stream commands format
	- $00    : Note cut and terminate parsing
	- $01    : Release and terminate parsing
	- $02    : Jump
	- $03    : Call
	- $04-$07: Reserved
	- $08    : Set default duration
	- $09    : Set instrument
	- $0A    : Set table
    - $0B-$0C: Reserved
	- $0D-$0F: Virtual channel flag (switch to virtual channel parsing mode until it terminates)
	- $10-$1F: Volume column
	- $20-$7F: Notes starting from C-1 and terminate parsing
	- $80-$AF: Commands without parsing terminating
	- $B0-$DF: Commands with parsing terminating
	- $E0-$FF: Quick default duration
	*/

	const CMD_NOTECUT = 0x00;
	const CMD_RELEASE = 0x01;
	const CMD_JUMP = 0x02;				// xx xx, x = jump location
	const CMD_CALL = 0x03; 				// xx yy yy, x = commands to read, y = call pointer
	const CMD_SET_DURATION = 0x08; 		// xx = duration
	const CMD_SET_INSTRUMENT = 0x09; 	// xx, x = instrument number
	const CMD_SET_TABLE = 0x0A; 		// xx xx, x = table number

	const CMD_HANDLE_VCHAN = 0x0D; 		// $0D-$0F
	const CMD_VOLUME_COLUMN = 0x10;		// $10-$1F
	const CMD_NOTE = 0x20				// $20-$7F

	const CMD_EFF_SPEED = 0x88;
	const CMD_EFF_TEMPO = 0x89;
	
	const CMD_QUICK_SET_DURATION = 0xE0; // $E0-$FF

	for (const chip of btpModule.songs) { // per chips
		const currentChipID = d_chipStringToID[chip.chipType];
		if (currentChipID === undefined) throw new Error(`Chip "${chip.chipType}" is not supported by the NSF driver currently.`);
		if (a_chipsList.includes(currentChipID)) throw new Error(`Same chip cannot be used more than once. Tried to add one another "${chip.chipType}".`);
		a_chipsList.push(currentChipID); // finally push the chip ID into the list
		
		// loop through patterns
		for (const targetPatID of btpModule.patternOrder) { // render linearly (compress later)
			const a_currentPattern = chip.patterns.find(p => p.id === targetPatID);
			if (!a_currentPattern) throw new Error(`Cannot find pattern ID ${targetPatID}. This should be the bug of the app itself.`); // for whatever reason
	
			a_currentPattern.channels.forEach((channelFrame, currentChannelID) => {
				// per channels
				
				// get physical, virtual channel ID
				let physicalChannelID;
				let virtualChannelID;
				{ // scope
					let currentIndex = 0;
					for (let p = 0; p < 64; p++) {
						const totalPortsForThisPhysical = chip.virtualChannelMap[String(p)] || 1; // the amount of added virtual channel count (0 if none)

						if (currentChannelID >= currentIndex && currentChannelID < currentIndex + totalPortsForThisPhysical) {
							const offset = currentChannelID - currentIndex;

							if (offset === 0) {
								physicalChannelID = p; virtualChannelID = -1;
								break;
							} else {
								physicalChannelID = p; virtualChannelID = offset -1;
								break;
							}
						}
						currentIndex += totalPortsForThisPhysical;
					}
					if (physicalChannelID === undefined || virtualChannelID === undefined) throw new Error(`Cannot find the effective channel ID of channel object ID ${currentChannelID}.`);
				}

				let chBuf = a_channelList.find(item => 
					item.chipID === currentChipID &&
					item.channelID === physicalChannelID &&
					item.virtualID === virtualChannelID
				);
				// check if it has to create new channel object
				if (!chBuf) {
					// intiaizlie channel
					chBuf = { 
						chipID: currentChipID,
						channelID: physicalChannelID,
						virtualID: virtualChannelID,

						// render temp
						delayCount: 0,
						lastDelayCount: -1,
						lastInstrument: -1,
						

						stream: [] // command buffer
					};
					a_channelList.push(chBuf);
				}

				for (const chRow of channelFrame.rows) {
					// chRow = A channels' row (linearly)
					if(
						chRow.note.name == 0 &&
						chRow.note.octave == 0 &&
						chRow.instrument == 0 &&
						chRow.table == 0 &&
						chRow.volume == 0 &&
						chRow.effects.every(item => item === null)
					) {
						chBuf.delayCount++; // empty row. increment delay Count
					} else {
						// has something sensical
						
						// delay
						if (chBuf.delayCount != chBuf.lastDelayCount) { // differnt duration
							chBuf.lastDelayCount = chBuf.delayCount; // update last delay count

							if (chBuf.delayCount >= 32) {
								let delayDec = chBuf.delayCount-32;
								while (delayDec > 255) {
									chBuf.stream.push(CMD_SET_DURATION, 255);
									delayDec-=255;
								}
								chBuf.stream.push(CMD_SET_DURATION, delayDec);

							} else {
								chBuf.stream.push(CMD_QUICK_SET_DURATION+chBuf.delayCount);
							}
						}
						chBuf.delayCount = 0;
						
						// note
						if (chRow.note.name == 1 && chRow.note.octave == 0) { // OFF
							chBuf.stream.push(CMD_NOTECUT);
						} else if (chRow.note.name == 14 && chRow.note.octave == 0) { // release
							chBuf.stream.push(CMD_RELEASE);
						} else if (
							chRow.note.name >= 2 && chRow.note.name <= 13 && 
							chRow.note.octave >= 1 && chRow.note.octave <= 8
						){ // valid note
							chBuf.stream.push(
								(
									(chRow.note.name-2) + ((chRow.note.octave-1)*12)
								) + CMD_NOTE
							);
						} else { // invalid / empty
							chBuf.stream.push(CMD_TERMINATE);
						}
					}
				}
			});
		}
	}
	
	i_currentAddress = i_loadAddress; // only used to track label
	a_byteObjList = [];
	d_labelAddrTbl = {};
	
	// Write header
	pushLabel("SongDataPtr");
	pushByte(btpModule.initialSpeed);
	pushByte(btpModule.tempo);
	pushLabel("ChipPeriodTable");
	pushLabel("InstrumentTable");
	pushLabel("TableTable");
	pushLabel("DPCMIndexTable");
	

	// Byte compiler
	let a_byteBuffer = []; // final output buffer
	for (const obj of a_byteObjList) {
		if (typeof obj === 'string') { // label
			if (!(obj in d_labelAddrTbl)) {
				console.warn(`\x1b[31mUndefined label "${obj}"!\x1b[0m This is a critical error occured by the programmer of the NSF driver, not your fault. Please report this.`);
				a_byteBuffer.push(0xFF, 0xFF); // fill with $FFFF for anyway
			} else {
				a_byteBuffer.push(d_labelAddrTbl[obj] & 0xFF, (d_labelAddrTbl[obj] >> 8) & 0xFF);
			}
		} else { // raw byte
			a_byteBuffer.push(obj & 0xFF);
		}
	}

	return new Uint8Array(a_byteBuffer);
}

// ======================================================================================================

const pushByte = (val)       => { a_byteObjList.push(val & 0xFF); i_currentAddress++; }
const pushWord = (val)       => { a_byteObjList.push((val & 0xFF), ((val >> 8) & 0xFF)); i_currentAddress+=2; }
const pushLabel= (labelname) => { a_byteObjList.push(labelname); i_currentAddress+=2; }
const setLabel = (labelstr)  => { d_labelAddrTbl[labelstr] = i_currentAddress; }

// ======================================================================================================

function getActualChannelIndexFromPatternChannelObjectID(flatIndex, virtualChannelMap) {//, totalPhysicalPorts = 5) {
	let currentIndex = 0;

	for (let p = 0; p < 64; p++) {
		const extraVirtuals = virtualChannelMap[String(p)] || 1; // the amount of added virtual channel count (0 if none)
		// the amount of channels a physical channel occupies (one for main + virtual)
		const totalPortsForThisPhysical = extraVirtuals;

		if (flatIndex >= currentIndex && flatIndex < currentIndex + totalPortsForThisPhysical) {
			const offset = flatIndex - currentIndex;

			if (offset === 0) {
				return { physicalPort: p, virtualPort: -1 };
			} else {
				return { physicalPort: p, virtualPort: offset - 1 };
			}
		}

		currentIndex += totalPortsForThisPhysical;
	}

	// return null;
	throw new Error(`Cannot find the effective channel ID of channel object ID ${flatIndex}.`);
}

// ======================================================================================================
//
// Wrapper for CLI Excution
//
// ======================================================================================================

if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length != 3) {
        console.log(`Usage: ${require('path').basename(process.argv[1])} <module.btp> <load address> <output.bin>`);
        process.exit(1);
    }

    try {
        require('fs').writeFileSync(args[2], convertBitphaseJsonToNSFBytecode(JSON.parse(require('zlib').gunzipSync(require('fs').readFileSync(args[0])).toString('utf8')), Number(args[1])));
        console.log(`Data output.`);
		process.exit(0);
    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
}