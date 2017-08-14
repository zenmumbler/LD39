// RUN! Before the Power runs out! - a game for LD39: Running out of Power
// (c) 2017 by Arthur Langereis — @zenmumbler

/// <reference path="imports.ts" />
/// <reference path="sfx.ts" />
/// <reference path="legacyeffect.ts" />

interface GameObject {
	entity: entity.Entity;
	transform: entity.TransformInstance;
	collider?: entity.ColliderInstance;
	mesh?: entity.MeshInstance;
	effectData?: render.EffectData;
	light?: entity.LightInstance;
}

class LD39Scene implements sd.SceneDelegate {
	scene: sd.Scene;
	legacy: render.Effect;
	wallTex: render.Texture;
	ceilTex: render.Texture;
	floorTex: render.Texture;
	doorTex: render.Texture;
	boxTex: render.Texture;

	wallED: render.EffectData;
	ceilED: render.EffectData;
	floorED: render.EffectData;
	doorED: render.EffectData;
	boxED: render.EffectData;
	baseEDs: render.EffectData[];

	boxMesh: meshdata.MeshData;
	baseMesh: meshdata.MeshData;

	sound_: Sound;
	soundAssets: SoundAssets;

	boxShape: physics.PhysicsShape;
	baseShape: physics.PhysicsShape;
	boxes: GameObject[] = [];

	baseObject: GameObject;

	playerCtl: PlayerController;

	willLoadAssets() {
		dom.show(".overlay.loading");
	}
	finishedLoadingAssets() {
		dom.hide(".overlay.loading");
	}

	loadAssets(): Promise<render.RenderCommandBuffer> {
		this.sound_ = new Sound(this.scene.ad);
		this.soundAssets = { steps: [] as AudioBuffer[] } as SoundAssets;

		const totalAssets = 11;
		let loadedAssets = 0;

		const progress = () => {
			loadedAssets += 1;
			const ratio = loadedAssets / totalAssets;
			dom.$1(".progress").style.width = (ratio * 100) + "%";
		};

		const assets = [
			image.loadImage(io.localURL("data/TexturesCom_GrayBareConcrete_albedo_S.jpg")).then(img => (progress(), img)),
			image.loadImage(io.localURL("data/TexturesCom_BrownConcrete_albedo_S.jpg")).then(img => (progress(), img)),
			image.loadImage(io.localURL("data/ceil-a.jpg")).then(img => (progress(), img)),
			image.loadImage(io.localURL("data/metalplate.jpg")).then(img => (progress(), img)),
			image.loadImage(io.localURL("data/crate.jpg")).then(img => (progress(), img)),

			sd.asset.loadOBJFile(io.localURL("data/base.obj")).then(img => (progress(), img)),

			loadSoundFile(this.scene.ad, "data/sound/Bart-Roijmans-Bigboss-looped.mp3").then(buf => { progress(); this.soundAssets.music = buf; }),
			loadSoundFile(this.scene.ad, "data/sound/34253__ddohler__hard-walking_0.mp3").then(buf => { progress(); this.soundAssets.steps[0] = buf; }),
			loadSoundFile(this.scene.ad, "data/sound/34253__ddohler__hard-walking_1.mp3").then(buf => { progress(); this.soundAssets.steps[1] = buf; }),
			loadSoundFile(this.scene.ad, "data/sound/381957__avensol__security-alarm.mp3").then(buf => { progress(); this.soundAssets.alarm = buf; }),
			loadSoundFile(this.scene.ad, "data/sound/363122__el-bee__landmass-earth-rumble.mp3").then(buf => { progress(); this.soundAssets.tremble = buf; }),
		];


		return Promise.all(assets as Promise<any>[]).then(
			([wallTex, ceilTex, floorTex, doorTex, boxTex, baseGroup]) => {
				this.wallTex = render.makeTex2DFromProvider(wallTex as image.PixelDataProvider, render.MipMapMode.Regenerate);
				this.ceilTex = render.makeTex2DFromProvider(ceilTex as image.PixelDataProvider, render.MipMapMode.Regenerate);
				this.floorTex = render.makeTex2DFromProvider(floorTex as image.PixelDataProvider, render.MipMapMode.Regenerate);
				this.doorTex = render.makeTex2DFromProvider(doorTex as image.PixelDataProvider, render.MipMapMode.Regenerate);
				this.boxTex = render.makeTex2DFromProvider(boxTex as image.PixelDataProvider, render.MipMapMode.Regenerate);

				// -- boxes
				const cubeHalfExt = 0.25;
				this.boxMesh = meshdata.gen.generate(new meshdata.gen.Box(meshdata.gen.cubeDescriptor(cubeHalfExt * 2)));
				this.boxShape = physics.makeShape({
					type: physics.PhysicsShapeType.Box,
					halfExtents: [cubeHalfExt, cubeHalfExt, cubeHalfExt]
				})!;

				// -------- DA BASE
				const baseG = baseGroup as asset.AssetGroup;
				this.baseMesh = baseG.meshes[0];
				this.baseShape = physics.makeShape({
					type: physics.PhysicsShapeType.Mesh,
					mesh: this.baseMesh
				})!;

				const rcb = new render.RenderCommandBuffer();
				rcb.allocate(this.wallTex);
				rcb.allocate(this.ceilTex);
				rcb.allocate(this.floorTex);
				rcb.allocate(this.doorTex);
				rcb.allocate(this.boxTex);
				rcb.allocate(this.boxMesh);
				rcb.allocate(this.baseMesh);
				return rcb;
			}
		);
	}

	keyboardStuff() {
		dom.on(dom.$(`input[type="radio"][name="keymap"]`), "click", evt => {
			const radio = evt.target as HTMLInputElement;
			if (radio.checked) {
				const km = radio.dataset.km;
				if (km === "qwerty") {
					this.playerCtl.keyboardType = KeyboardType.QWERTY;
					dom.$1("#keymapping").textContent = "WASD";
				}
				else {
					this.playerCtl.keyboardType = KeyboardType.AZERTY;
					dom.$1("#keymapping").textContent = "ZQSD";
				}
			}
		});
	}

	fullscreenStuff() {
		dom.on(".stageholder", "click", evt => {
			// fullscreen on Win and Chrome in general implies pointer lock?
			if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement) {
				if (this.mode === "menu") {
					this.begin();
				}
			}
		});

		dom.on(dom.$(`input[type="radio"][name="vpsize"]`), "click", evt => {
			const radio = evt.target as HTMLInputElement;
			if (radio.checked) {
				const vpsSize = radio.dataset.vps || "hdready";
				const holder = dom.$1(".stageholder");
				holder.className = `stageholder ${vpsSize}`;

				const width = ({ small: 960, hdready: 1280, fullhd: 1920 } as any)[vpsSize];
				const height = ({ small: 540, hdready: 720, fullhd: 1080 } as any)[vpsSize];
				this.scene.rw.resizeDrawableTo(width, height);
				this.scene.camera.resizeViewport(width, height);
			}
		});

		dom.on("#fullscreen", "click", () => {
			const canvas = dom.$1(".stageholder");
			(canvas.requestFullscreen || canvas.webkitRequestFullscreen || canvas.mozRequestFullScreen).call(canvas);

			if (this.mode === "play") {
				canvas.requestPointerLock();
			}
		});

		const fsch = () => {
			const canvas = dom.$1(".stageholder");
			const rw = this.scene.rw;
			if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement) {
				const scaleFactor = Math.min(screen.width / rw.drawableWidth, screen.height / rw.drawableHeight);

				// Firefox needs the pointerlock request after fullscreen activates
				canvas.requestPointerLock();

				if (document.mozFullScreenElement) {
					const hOffset = Math.round((screen.width - rw.drawableWidth) / (2 * scaleFactor)) + "px";
					const vOffset = Math.round((screen.height - rw.drawableHeight) / (2 * scaleFactor)) + "px";

					dom.$(".stageholder > *").forEach((e: HTMLElement) => {
						e.style.transform = `scale(${scaleFactor}) translate(${hOffset}, ${vOffset})`;
					});
				}
				else {
					// Safari and Chrome, the vOffset is for macOS to adjust for the menubar
					const vOffset = "-13px"; // on macOS this == Math.round((screen.availHeight - screen.height) / 2) + "px", Chrome Windows keeps this for compat reasons?
					canvas.style.transform = `scale(${scaleFactor}) translate(0, ${vOffset})`;
				}
			}
			else {
				canvas.style.transform = "";
				dom.$(".stageholder > *").forEach((e: HTMLElement) => {
					e.style.transform = "";
				});
			}
		};

		dom.on(document, "fullscreenchange", fsch);
		dom.on(document, "webkitfullscreenchange", fsch);
		dom.on(document, "mozfullscreenchange", fsch);
	}

	buildWorld(): Promise<void> {
		const scene = this.scene;
		this.scene.camera.perspective(65, .1, 20);

		this.legacy = this.scene.rw.rd.effectByName("legacy")!;
		(this.legacy as LegacyEffect).useLightingSystem(this.scene.rw.lighting);

		this.boxED = this.legacy.makeEffectData();
		this.legacy.setTexture(this.boxED, "diffuse", this.boxTex);

		this.wallED = this.legacy.makeEffectData();
		this.legacy.setTexture(this.wallED, "diffuse", this.wallTex);
		this.legacy.setVector(this.wallED, "texScaleOffset", [.25, .25, 0, 0]);
		this.ceilED = this.legacy.makeEffectData();
		this.legacy.setTexture(this.ceilED, "diffuse", this.wallTex);
		this.legacy.setVector(this.ceilED, "texScaleOffset", [.125, .125, 0, 0]);
		this.floorED = this.legacy.makeEffectData();
		this.legacy.setTexture(this.floorED, "diffuse", this.floorTex);
		this.legacy.setVector(this.floorED, "texScaleOffset", [.125, .125, 0, 0]);
		this.doorED = this.legacy.makeEffectData();
		this.legacy.setTexture(this.doorED, "diffuse", this.doorTex);
		this.baseEDs = [this.wallED, this.ceilED, this.doorED, this.floorED];

		const makeGO = (mass: number, position: sd.ConstFloat3, meshData: meshdata.MeshData, ed: render.EffectData, shape: physics.PhysicsShape, friction = 0.6): GameObject => {
			const entity = scene.entities.create();
			const transform = scene.transforms.create(entity, { position });
			const collider = scene.colliders.create(entity, { rigidBody: {
				mass,
				shape,
				friction
			}});
			const mesh = scene.meshes.create(meshData);
			scene.meshes.linkToEntity(mesh, entity);
			const effectData = ed;
			return { entity, transform, collider, mesh, effectData };
		};

		const makeLight = (position: sd.ConstFloat3, lightDesc: entity.Light): GameObject => {
			const entity = scene.entities.create();
			const transform = scene.transforms.create(entity, { position });
			const light = scene.lights.create(entity, lightDesc);
			return { entity, transform, light };
		};

		const makeCeilingLight = (x: number, z: number, kalah?: sd.ConstFloat3) => {
			makeLight([x, 2.8, z], {
				type: entity.LightType.Point,
				colour: kalah || [1, 1, 1],
				intensity: 1.5,
				range: 4.5
			});
		};

		// center corridor
		makeCeilingLight(0, 2);
		makeCeilingLight(0, 10);
		makeCeilingLight(0, 18);
		makeCeilingLight(0, 26);
		makeCeilingLight(0, 34);
		makeCeilingLight(0, 42);
		makeCeilingLight(0, 50);
		makeCeilingLight(0, 58);
		makeCeilingLight(0, 66);
		makeCeilingLight(0, 74);
		makeCeilingLight(0, 82);
		makeCeilingLight(0, 90);
		makeCeilingLight(0, 98);

		// west corridor
		makeCeilingLight(8, 50);
		makeCeilingLight(14.5, 44.5); // zambie door
		makeCeilingLight(16, 50);
		makeCeilingLight(24.5, 50);
		makeCeilingLight(24.5, 58);
		makeCeilingLight(24.5, 66);
		makeCeilingLight(24.5, 72);
		makeCeilingLight(24.5, 80);
		makeCeilingLight(16, 80);
		makeCeilingLight(8, 80, [0, 1, 0]);

		// east wing
		makeCeilingLight(-8, 50); // east entry
		makeCeilingLight(-16, 50);
		makeCeilingLight(-24, 50);
		makeCeilingLight(-28.5, 54); // east upper fork
		makeCeilingLight(-28.5, 62);
		makeCeilingLight(-28.5, 71);
		makeCeilingLight(-28.5, 80);
		makeCeilingLight(-20, 80);
		makeCeilingLight(-12, 80, [0, 1, 0]);

		makeCeilingLight(-32.5, 64); // east upper side branch
		makeCeilingLight(-41, 64);

		makeCeilingLight(-28.5, 46); // east lower fork
		makeCeilingLight(-28.5, 38);
		makeCeilingLight(-28.5, 30);
		makeCeilingLight(-28.5, 24); // zambie door

		makeCeilingLight(-32.5, 28); // east lower side branch
		makeCeilingLight(-41, 28);

		makeCeilingLight(-41, 50); // east final corridor
		makeCeilingLight(-57, 50, [0, 1, 0]);

		this.baseObject = makeGO(0, [0, 0, 0], this.baseMesh, this.wallED, this.baseShape, .9);

		this.boxes.push(makeGO(1, [-1, .3, 7], this.boxMesh, this.boxED, this.boxShape));

		this.boxes.push(makeGO(1, [-25, .3, 50.3], this.boxMesh, this.boxED, this.boxShape));
		this.boxes.push(makeGO(1, [-25.1, .8, 50], this.boxMesh, this.boxED, this.boxShape));
		this.boxes.push(makeGO(1, [-24.9, .3, 49.7], this.boxMesh, this.boxED, this.boxShape));
		
		this.boxes.push(makeGO(1, [24.7, .3, 54], this.boxMesh, this.boxED, this.boxShape));
		this.boxes.push(makeGO(1, [23, .3, 55], this.boxMesh, this.boxED, this.boxShape));
		this.boxes.push(makeGO(1, [23.4, .3, 54.1], this.boxMesh, this.boxED, this.boxShape));

		this.playerCtl = new PlayerController(dom.$1("canvas"), [0, 1.1, 3], scene, this.sound_);
		this.sound_.setAssets(this.soundAssets);
		this.sound_.startMusic();

		this.keyboardStuff();
		this.fullscreenStuff();
		dom.show(".overlay.titles");

		return Promise.resolve();
	}

	update(timeStep: number) {
		if (this.mode === "play") {
			this.playerCtl.step(timeStep);
		}
		const finalEye = this.playerCtl.view.pos;
		vec2.add(finalEye, finalEye, this.playerCtl.shakeOffset);
		this.scene.camera.lookAt(finalEye, this.playerCtl.view.focusPos, this.playerCtl.view.up);
	}

	flicker = false;
	flickerEnd = 3.0;
	nextRumble = 8.0;
	hideMessage = 0;
	totalTime = 105;

	mode = "menu";
	playStart = 0;
	haveKeys = [false, false, false];

	reset() {
		this.haveKeys = [false, false, false];
		this.playerCtl.view.rigidBody.setAngularVelocity(new Ammo.btVector3(0, 0, 0));
		this.playerCtl.view.rigidBody.setAngularFactor(new Ammo.btVector3(0, 1, 0));
		this.playerCtl.view.reset();
		this.playerCtl.releaseMouse();

		const lit = this.scene.lights.allEnabled().makeIterator();
		while (lit.next()) {
			this.scene.lights.setIntensity(lit.current, 1.5);
		}
		this.sound_.startMusic();
		this.mode = "menu";
		dom.show(".overlay.titles");
		dom.hide("p.message");
		dom.hide("p.timer");
	}

	die() {
		const lit = this.scene.lights.allEnabled().makeIterator();
		while (lit.next()) {
			this.scene.lights.setIntensity(lit.current, 0);
		}
		this.showMessage("AAaAAaARgrhgrfjrgckckckkllll.......");
		this.hideMessage = 99999;
		this.mode = "end";
		this.playerCtl.stopSteps();
		this.playerCtl.view.rigidBody.setAngularFactor(new Ammo.btVector3(1, 1, 1));
		this.sound_.stopMusic();
		this.sound_.stopAlarm();
		this.sound_.play(SFX.Tremble);

		setTimeout(() => { this.reset(); }, 8000);
	}

	keyCount() {
		return this.haveKeys.reduce((sum, have) => sum + (+have), 0);
	}

	showMessage(msg: string) {
		dom.$1("p.message").textContent = msg;
		dom.show("p.message");
		dom.$1("p.message").style.zIndex = "6";
		this.hideMessage = sd.App.globalTime + 4;
	}

	showKeyCollectionMessage() {
		const keyCount = this.keyCount();
		let msg: string;
		if (keyCount === 0) {
			msg = "Find the 3 keys and then find the exit! Hurry! This place is falling apart!";
		}
		else if (keyCount === 1) {
			msg = "You found 1 out of 3 keys! Keep going!";
		}
		else if (keyCount === 2) {
			msg = "You found 2 out of 3 keys! Hurry and find the last one!";
		}
		else {
			msg = "You've got all the keys! Now where's the exit?!";
		}

		this.showMessage(msg);
	}

	begin() {
		this.mode = "play";
		dom.hide(".overlay.titles");
		dom.$1("p.timer").textContent = "01:45";
		dom.show("p.timer");
		this.playerCtl.view.reset();
		this.playerCtl.tryCaptureMouse();
		this.sound_.startAlarm();
		setTimeout(() => {
			this.showKeyCollectionMessage();
		}, 1000);

		const now = sd.App.globalTime;
		this.nextRumble = now + 8;
		this.playStart = now;
	}

	frame(timeStep: number) {
		const scene = this.scene;
		const now = sd.App.globalTime;

		this.update(timeStep);
		scene.physics.update(timeStep);

		// flicker lights
		if (this.mode !== "end") {
			if (now > this.flickerEnd) {
				const willFlicker = Math.random() < 0.01;

				if (willFlicker !== this.flicker) {
					this.flicker = willFlicker;
					if (willFlicker) {
						this.flickerEnd = now + 0.1;
					}
					const intensity = willFlicker ? (math.intRandomRange(9, 12) / 10) : 1.5;

					const lit = scene.lights.allEnabled().makeIterator();
					while (lit.next()) {
						scene.lights.setIntensity(lit.current, intensity);
					}
				}
			}
		}

		// messages
		if ((this.mode !== "end") && (now > this.hideMessage)) {
			dom.hide("p.message");
		}

		if (this.mode === "play") {
			// timer
			const timeLeft = Math.max(0, this.totalTime - (now - this.playStart));
			const minutes = Math.floor(timeLeft / 60);
			const seconds = Math.floor(timeLeft % 60);
			let secondsStr = "" + seconds;
			if (secondsStr.length < 2) { secondsStr = "0" + secondsStr; }
			const millis = timeLeft - (60 * minutes) - seconds;
			const timeStr = `0${minutes}:${secondsStr}`;
			dom.$1("p.timer").textContent = timeStr;

			if (timeLeft === 0) {
				this.die();
			}
			else {
				// rumble
				if (now > this.nextRumble) {
					if (this.playerCtl.shaking) {
						this.nextRumble = now + 15;
					}
					else {
						this.sound_.play(SFX.Tremble);
						this.nextRumble = now + 3.5;
					}
					this.playerCtl.shaking = !this.playerCtl.shaking;
				}

				// check key collection
				const playerPos = this.playerCtl.view.pos;
				const playerPosXZ = [playerPos[0], playerPos[2]];
				if (! this.haveKeys[0]) {
					if (vec2.distance(playerPosXZ, [8, 80]) < 4) {
						this.haveKeys[0] = true;
						this.showKeyCollectionMessage();
					}
				}
				if (! this.haveKeys[1]) {
					if (vec2.distance(playerPosXZ, [-12, 80]) < 4) {
						this.haveKeys[1] = true;
						this.showKeyCollectionMessage();
					}
				}
				if (! this.haveKeys[2]) {
					if (vec2.distance(playerPosXZ, [-57, 50]) < 4) {
						this.haveKeys[2] = true;
						this.showKeyCollectionMessage();
					}
				}

				if (vec2.distance(playerPosXZ, [0, 2]) < 4) {
					if (this.keyCount() > 0) {
						this.showMessage("This door leads back into the facility!");
					}
				}
				else if (vec2.distance(playerPosXZ, [14.5, 44.5]) < 4) {
					this.showMessage("There are zombies behind this door! Find another exit!");
				}
				else if (vec2.distance(playerPosXZ, [-28.5, 24]) < 4) {
					this.showMessage("The door is jammed! No way I can exit from here!");
				}
				else if (vec2.distance(playerPosXZ, [0, 98]) < 4) {
					if (this.keyCount() < 3) {
						this.showMessage("It seems safe..., but it takes 3 keys to open!");
					}
					else {
						this.sound_.stopAlarm();
						this.playerCtl.stopSteps();
						this.mode = "end";
						this.showMessage("You made it to safety! Congratulations!!");
						setTimeout(() => { this.reset(); }, 8000);
					}
				}
			}
		}


		// creating render commands
		const cmds = scene.rw.lighting.prepareLightsForRender(
			scene.lights,
			scene.lights.allEnabled(),
			scene.transforms,
			scene.camera,
			scene.camera.viewport
		);

		if (! (this.scene.rw.lighting.lutTextureSampler && this.scene.rw.lighting.lutTextureSampler.tex && this.scene.rw.lighting.lutTextureSampler.tex.renderResourceHandle)) {
			return cmds;
		}

		cmds.setFrameBuffer(null, render.ClearMask.ColourDepth, { colour: [0.0, 0.0, 0.0, 1.0] });
		cmds.setViewport(scene.camera.viewport);
		for (let bmx = 0; bmx < this.baseMesh.subMeshes.length; ++bmx) {
			const bsm = this.baseMesh.subMeshes[bmx];
			const ed = this.baseEDs[bmx];
			this.legacy.addRenderJobs(ed, this.scene.camera, scene.transforms.worldMatrix(this.baseObject.transform), this.baseMesh, bsm, cmds);
		}
		for (const box of this.boxes) {
			this.legacy.addRenderJobs(box.effectData!, this.scene.camera, scene.transforms.worldMatrix(box.transform), this.boxMesh, this.boxMesh.subMeshes[0], cmds);
		}

		return cmds;
	}
}


sd.App.messages.listenOnce("AppStart", undefined, () => {
	const stageHolder = dom.$1(".stageholder");
	const rw = new render.RenderWorld(stageHolder, 1280, 720);
	const adev = audio.makeAudioDevice()!;

	rw.rd.registerEffect(new LegacyEffect());

	const scene = new sd.Scene(rw, adev, {
		assetURLMapping: {},
		physicsConfig: physics.makeDefaultPhysicsConfig(),
		delegate: new LD39Scene()
	});
	sd.App.scene = scene;
});
