; ======================================================================================================
; Bitphase NSF Driver
; - Format Version 1
; ======================================================================================================

; ======================================================================================================
;
; Copyright 2026 Heemin
;
; Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
; associated documentation files (the "Software"), to deal in the Software without restriction,
; including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
; and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so.
;
; THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
; LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
; IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
; LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
; WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
;
; ======================================================================================================

; ======================================================================================================
;
; Using this driver
;     Communication with your game is entirely done using subroutines. Such ways like music ID variable
;     should be what you should implement manually (communicating with one-byte RAM is a recommended way
;     for thread-safety task)
;
;     `bp_playSong` - Play a song with track ptr loaded in LSB: <A>, MSB: <X>.
;     `bp_updateDriver` - Update music driver.
;
;      The driver doesn't contain SFX player. Instead it provides a variable for **enabling** register
;      writes in music (only 2A0A channels). This way, you can disable each music channels and push your
;      own registers in another thread. `bp_var_Enabled_Channels` is what controls the register writes,
;      with exact same bit format of $4015. The register is **NOT** initialized by this driver itself.
;      You must write $FF before updating driver when playing music only.
;
;      For the same reason, the `bp_var_ch_Period_MSB_Old`, which stores old MSB byte of 2A03 and MMC5
;      pulse channels' period registers, is also **UNINITIALIZED** and should be used for your SFX too.
;
; ======================================================================================================
;
; Build Options (0 = false, 1 = true, any other numbers are invalid)
;
;     You should specify `bp_zp` and `bp_bss` somewhere in your game.
;     Each size is specified with `bp_zp_size` and `bp_bss_size`.
;     It can be simply done like `bp_zp: .dsb bp_zp` and `bp_bss: .dsb bp_bss_size` inside `ENUM` 
;     directive.
;     Or like `bp_zp = $F8` and `bp_bss = $200` to hard-map them in a fixed area.
;
; ======================================================================================================
	
BP_UNOFFICIAL_INSTRUCTIONS = 0
	; ^ Disabled by default for compatibility with old NSF players.
	;   Turning this on may improve performance slightly.
	
BP_MMC5 = 0
BP_5B = 0
BP_EPSM = 0
	
; ======================================================================================================
; Buildtime Constant (internal)
; ======================================================================================================

BP_PHYSICAL_CH_COUNT = 5+(BP_MMC5*2)+(BP_5B*3)
BP_EFFECTIVE_CH_COUNT = BP_PHYSICAL_CH_COUNT*4
BP_PULSE_COUNT = 2+(MMC5*2)

; ======================================================================================================

enum bp_zp
		bp_temp:
		bp_temp0: .dsb 1
		bp_temp1: .dsb 1
		bp_temp_ptr: .dsb 2
		
bp_zp_end:
ende
bp_zp_size = bp_zp_end-bp_zp

; ======================================================================================================

enum bp_bss
		bp_Enabled_Channels:		.dsb 1 ; ...D NT21 D = Enbale DPCM, N = Enable noise, T = Enable triangle, 2 = Enable pulse 2, 1 = Enable pulse 1
		bp_var_ch_Period_MSB_Old:	.dsb BP_PULSE_COUNT
		
		bp_var_Base_Song_Ptr: 			.dsb 2
		bp_var_Groove_Tbl: 				.dsb 2 ; MSB = 0 means it's using single speed
		bp_var_Groove_Timer:			.dsb 1

		bp_var_ch_Pattern_lo: 			.dsb BP_EFFECTIVE_CH_COUNT
		bp_var_ch_Pattern_hi: 			.dsb BP_EFFECTIVE_CH_COUNT
		bp_var_ch_Return_lo: 			.dsb BP_EFFECTIVE_CH_COUNT
		bp_var_ch_Return_hi: 			.dsb BP_EFFECTIVE_CH_COUNT
		bp_var_ch_Remaining_Ref_Cmd_Cnt:.dsb BP_EFFECTIVE_CH_COUNT
		bp_var_ch_Delay_Reload:			.dsb BP_EFFECTIVE_CH_COUNT
		bp_var_ch_Delay:				.dsb BP_EFFECTIVE_CH_COUNT
		
		bp_var_ch_VolumeColumn:			.dsb BP_EFFECTIVE_CH_COUNT ; volume column << 4
		
bp_bss_end:
ende
bp_bss_size = bp_bss_end-bp_bss

; ======================================================================================================

bp_playSong:
		STA bp_var_Base_Song_Ptr+0
		STA bp_temp_ptr+0
		STX bp_var_Base_Song_Ptr+1
		STX bp_temp_ptr+1

		RTS
		
; ======================================================================================================
		
bp_updateDriver:
		RTS
		
; ======================================================================================================
		
bp_volumeTable:
		.BYTE 0,   0,   0,	0,   0,	  0,   0,   0,	 0,   0,   0,	0,   0,	  0,   0,   0
		.BYTE 0,   1,   1,	1,   1,	  1,   1,   1,	 1,   1,   1,	1,   1,	  1,   1,   1
		.BYTE 0,   1,   1,	1,   1,	  1,   1,   1,	 1,   1,   1,	1,   1,	  1,   1,   2
		.BYTE 0,   1,   1,	1,   1,	  1,   1,   1,	 1,   1,   2,	2,   2,	  2,   2,   3
		.BYTE 0,   1,   1,	1,   1,	  1,   1,   1,	 2,   2,   2,	2,   3,	  3,   3,   4
		.BYTE 0,   1,   1,	1,   1,	  1,   2,   2,	 2,   3,   3,	3,   4,	  4,   4,   5
		.BYTE 0,   1,   1,	1,   1,	  2,   2,   2,	 3,   3,   4,	4,   4,	  5,   5,   6
		.BYTE 0,   1,   1,	1,   1,	  2,   2,   3,	 3,   4,   4,	5,   5,	  6,   6,   7
		.BYTE 0,   1,   1,	1,   2,	  2,   3,   3,	 4,   4,   5,	5,   6,	  6,   7,   8
		.BYTE 0,   1,   1,	1,   2,	  3,   3,   4,	 4,   5,   6,	6,   7,	  7,   8,   9
		.BYTE 0,   1,   1,	2,   2,	  3,   4,   4,	 5,   6,   6,	7,   8,	  8,   9,  10
		.BYTE 0,   1,   1,	2,   2,	  3,   4,   5,	 5,   6,   7,	8,   8,	  9,  10,  11
		.BYTE 0,   1,   1,	2,   3,	  4,   4,   5,	 6,   7,   8,	8,   9,	 10,  11,  12
		.BYTE 0,   1,   1,	2,   3,	  4,   5,   6,	 6,   7,   8,	9,  10,	 11,  12,  13
		.BYTE 0,   1,   1,	2,   3,	  4,   5,   6,	 7,   8,   9,  10,  11,	 12,  13,  14
		.BYTE 0,   1,   2,	3,   4,	  5,   6,   7,	 8,   9,  10,  11,  12,	 13,  14,  15