/*======================================================================================================
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
======================================================================================================*/

const fs = require('fs');

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
	// Generate linear abstract command stream per each channels
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
	let a_channelList = []; // channel stream buffers
	for (const a_chip of btpModule.songs) { // per chips
		const i_currentChipID = d_chipStringToID[a_chip.chipType];
		if (i_currentChipID === undefined) throw new Error(`Chip "${a_chip.chipType}" is not supported by the NSF driver currently.`);
		if (a_chipsList.includes(i_currentChipID)) throw new Error(`Same chip cannot be used more than once. Tried to add one another "${a_chip.chipType}".`);
		a_chipsList.push(i_currentChipID); // finally push the chip ID into the list
		
		// loop through patterns
		for (const i_targetPatID of btpModule.patternOrder) { // render linearly (compress later)
			const a_currentPattern = a_chip.patterns.find(p => p.id === i_targetPatID);
			if (!a_currentPattern) throw new Error(`Cannot find pattern ID ${i_targetPatID}. This should be the bug of the app itself.`); // for whatever reason
	
			a_currentPattern.channels.forEach((a_currentChannel, i_currentChannelID) => {
				for (const a_currentRow of a_currentChannel.rows) {
					// a_currentRow = A channels' row (linearly)
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
		const extraVirtuals = virtualChannelMap[String(p)] || 0; // the amount of added virtual channel count (0 if none)
		// the amount of channels a physical channel occupies (one for main + virtual)
		const totalPortsForThisPhysical = 1 + extraVirtuals;

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
        fs.writeFileSync(args[2], convertBitphaseJsonToNSFBytecode(JSON.parse(require('zlib').gunzipSync(fs.readFileSync(args[0])).toString('utf8')), Number(args[1])));
        console.log(`Data output.`);
		process.exit(0);
    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
}