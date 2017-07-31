// RUN! Before the Power runs out! - a game for LD39: Running out of Power
// (c) 2017 by Arthur Langereis — @zenmumbler

const enum SFX {
	FootStep,
	Tremble,
	Zombies,
	DoneGood
}

const enum Music {
	None,
	Main
}

interface SoundAssets {
	steps: AudioBuffer[];
	alarm: AudioBuffer;
	music: AudioBuffer;
	tremble: AudioBuffer;
	zombies: AudioBuffer;
	doneGood: AudioBuffer;
}

function loadSoundFile(ad: audio.AudioDevice, filePath: string): Promise<AudioBuffer> {
	return io.loadFile(filePath, {
		responseType: io.FileLoadType.ArrayBuffer
	}).then((data: ArrayBuffer) => {
		return audio.makeAudioBufferFromData(ad, data);
	});
}

class Sound {
	private assets_: SoundAssets;
	private ctx: AudioContext;

	private stepGain: GainNode;
	private musicGain: GainNode;
	private alarmGain: GainNode;
	private effectGain: GainNode;

	private stepSource: AudioBufferSourceNode | null = null;
	private musicSource: AudioBufferSourceNode | null = null;
	private alarmSource: AudioBufferSourceNode | null = null;
	private effectSource: AudioBufferSourceNode | null = null;

	private stepToggle = 0;

	constructor(private ad: audio.AudioDevice) {
		const ctx = this.ctx = ad.ctx;

		this.stepGain = ctx.createGain();
		this.musicGain = ctx.createGain();
		this.alarmGain = ctx.createGain();
		this.effectGain = ctx.createGain();

		this.stepGain.connect(ctx.destination);
		this.musicGain.connect(ctx.destination);
		this.alarmGain.connect(ctx.destination);
		this.effectGain.connect(ctx.destination);
	}


	setAssets(assets: SoundAssets) {
		this.assets_ = assets;
	}


	startMusic() {
		if (! this.musicSource) {
			this.musicSource = this.ad.ctx.createBufferSource();
			this.musicSource.buffer = this.assets_.music;
			this.musicSource.loop = true;
			this.musicSource.connect(this.musicGain);
			this.musicGain.gain.value = 0.7;

			this.musicSource.start(0);
		}
	}

	stopMusic() {
		if (this.musicSource) {
			this.musicSource.stop();
			this.musicSource = null;
		}
	}

	get alarmPlaying() {
		return this.alarmSource != null;
	}

	startAlarm() {
		if (! this.alarmSource) {
			this.alarmSource = this.ctx.createBufferSource();
			this.alarmSource.buffer = this.assets_.alarm;
			this.alarmSource.loop = true;
			this.alarmSource.connect(this.alarmGain);
			this.alarmGain.gain.value = 0.9;

			this.alarmSource.start(0);
		}
	}

	stopAlarm() {
		if (this.alarmSource) {
			this.alarmSource.stop();
			this.alarmSource = null;
		}
	}

	play(what: SFX) {
		var assets = this.assets_;
		if (! this.ad) {
			return;
		}

		var buffer: AudioBuffer | null = null;
		var source: AudioBufferSourceNode | null = null;
		var gain: GainNode | null = null;
		var volume = 0;
		var rate: number | null = null;

		switch (what) {
			case SFX.FootStep: buffer = assets.steps[this.stepToggle]; source = this.stepSource; gain = this.stepGain; volume = .8; rate = 1; this.stepToggle ^= 1; break;
			case SFX.Tremble: buffer = assets.tremble; source = this.effectSource; gain = this.effectGain; volume = 1; rate = 1.0; break;
			case SFX.Zombies: buffer = assets.zombies; source = this.effectSource; gain = this.effectGain; volume = 1; rate = 1.0; break;
			case SFX.DoneGood: buffer = assets.doneGood; source = this.effectSource; gain = this.effectGain; volume = 1; rate = 1.0; break;

			default: buffer = null;
		}

		if (! buffer || ! gain) {
			return;
		}
		if (source) {
			source.stop();
		}

		var bufferSource: AudioBufferSourceNode | null = this.ad.ctx.createBufferSource();
		bufferSource.buffer = buffer;
		bufferSource.connect(gain);
		if (rate !== null) {
			bufferSource.playbackRate.value = rate;
		}
		bufferSource.start(0);
		gain.gain.value = volume;

		if (what === SFX.FootStep) {
			this.stepSource = bufferSource;
		}
		else {
			this.effectSource = bufferSource;
		}

		bufferSource.onended = () => {
			if (this.effectSource === bufferSource) {
				this.effectSource = null;
			}
			else if (this.stepSource === bufferSource) {
				this.stepSource = null;
			}

			bufferSource!.disconnect();
			bufferSource = null;
		};

	}
}
