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
	renderer?: entity.MeshRendererInstance;
	light?: entity.LightInstance;
}

class LD39Scene implements sd.SceneDelegate {
	scene: sd.Scene;
	playerCtl: PlayerController;

	cache: asset.Cache;
	pipeline: asset.AssetPipeline;
	assets: asset.CacheAccess;

	// assets (to be removed)
	wallTex: render.Texture;
	floorTex: render.Texture;
	doorTex: render.Texture;
	doorNormalTex: render.Texture;
	boxTex: render.Texture;

	boxMesh: meshdata.MeshData;
	baseMesh: meshdata.MeshData;

	sound_: Sound;
	soundAssets: SoundAssets;

	// component-derived objects (should also be automatic)
	boxShape: physics.PhysicsShape;
	baseShape: physics.PhysicsShape;


	willLoadAssets() {
		dom.show(".overlay.loading");
	}
	finishedLoadingAssets() {
		dom.hide(".overlay.loading");
	}

	loadAssets(): Promise<render.RenderCommandBuffer> {
		this.sound_ = new Sound(this.scene.ad);
		this.soundAssets = { steps: [] as AudioBuffer[] } as SoundAssets;

		this.cache = {};
		this.pipeline = asset.makeDefaultPipeline({
			type: "chain",
			loaders: [
				{ type: "data-url" },
				{ type: "rooted", prefix: "data", loader: { type: "doc-relative-url", relPath: "data/" } }
			]
		}, this.cache);
		this.assets = asset.cacheAccessor(this.cache);

		return io.loadFile("base-scene.json", { tryBreakCache: true, responseType: io.FileLoadType.JSON })
			.then((sceneJSON: any) => 
				Promise.all(sceneJSON.assets.map((a: asset.Asset) => this.pipeline.process(a)))
			).then(() => {
				// -------- DA BASE
				const base = this.assets("model", "base");
				console.info("BASE", base);
				this.baseMesh = base.mesh!;
				this.baseShape = physics.makeShape({
					type: physics.PhysicsShapeType.Mesh,
					mesh: this.baseMesh
				})!;

				this.wallTex = base.materials[1].colour.colourTexture!.texture;
				this.floorTex = base.materials[3].colour.colourTexture!.texture;
				this.doorTex = base.materials[2].colour.colourTexture!.texture;
				this.doorNormalTex = base.materials[2].normalTexture!.texture;

				// -- crate
				const crate = this.assets("model", "crate");
				console.info("CRATE", crate);
				const crateHalfExt = 0.25;
				this.boxMesh = crate.mesh!;
				this.boxShape = physics.makeShape({
					type: physics.PhysicsShapeType.Box,
					halfExtents: [crateHalfExt, crateHalfExt, crateHalfExt]
				})!;

				this.boxTex = crate.materials[0].colour.colourTexture!.texture;

				this.soundAssets.music = this.assets("audio", "music");
				this.soundAssets.steps[0] = this.assets("audio", "step0");
				this.soundAssets.steps[1] = this.assets("audio", "step1");
				this.soundAssets.alarm = this.assets("audio", "alarm");
				this.soundAssets.tremble = this.assets("audio", "rumble");

				const rcb = new render.RenderCommandBuffer();
				rcb.allocate(this.wallTex);
				rcb.allocate(this.floorTex);
				rcb.allocate(this.doorTex);
				rcb.allocate(this.doorNormalTex);
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

		const legacy = this.scene.rw.effectByName("legacy")!;

		const boxED = legacy.makeEffectData();
		legacy.setTexture(boxED, "diffuse", this.boxTex);
		const wallED = legacy.makeEffectData();
		legacy.setTexture(wallED, "diffuse", this.wallTex);
		legacy.setVector(wallED, "texScaleOffset", [.25, .25, 0, 0]);
		const ceilED = legacy.makeEffectData();
		legacy.setTexture(ceilED, "diffuse", this.wallTex);
		legacy.setVector(ceilED, "texScaleOffset", [.125, .125, 0, 0]);
		const floorED = legacy.makeEffectData();
		legacy.setTexture(floorED, "diffuse", this.floorTex);
		legacy.setVector(floorED, "texScaleOffset", [.125, .125, 0, 0]);
		const doorED = legacy.makeEffectData();
		legacy.setTexture(doorED, "diffuse", this.doorTex);
		legacy.setTexture(doorED, "normal", this.doorNormalTex);
		legacy.setValue(doorED, "specular", 1);
		const baseEDs = [wallED, ceilED, doorED, floorED];

		const makeGO = (mass: number, position: sd.ConstFloat3, meshData: meshdata.MeshData, ed: render.EffectData[], shape: physics.PhysicsShape, friction = 0.6): GameObject => {
			const entity = scene.entities.create();
			const transform = scene.transforms.create(entity, { position });
			const collider = scene.colliders.create(entity, { rigidBody: {
				mass,
				shape,
				friction
			}});
			const mesh = scene.meshes.create(meshData);
			scene.meshes.linkToEntity(mesh, entity);
			const renderer = scene.renderers.create(entity, {
				materials: ed
			});
			return { entity, transform, collider, mesh, renderer };
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

		makeGO(0, [0, 0, 0], this.baseMesh, baseEDs, this.baseShape, .9);

		makeGO(1, [-1, .3, 7], this.boxMesh, [boxED], this.boxShape);

		makeGO(1, [-25, .3, 50.3], this.boxMesh, [boxED], this.boxShape);
		makeGO(1, [-25.1, .8, 50], this.boxMesh, [boxED], this.boxShape);
		makeGO(1, [-24.9, .3, 49.7], this.boxMesh, [boxED], this.boxShape);
		
		makeGO(1, [24.7, .3, 54], this.boxMesh, [boxED], this.boxShape);
		makeGO(1, [23, .3, 55], this.boxMesh, [boxED], this.boxShape);
		makeGO(1, [23.4, .3, 54.1], this.boxMesh, [boxED], this.boxShape);

		this.playerCtl = new PlayerController(dom.$1("canvas"), [0, 1.1, 3], scene, this.sound_);
		this.sound_.setAssets(this.soundAssets);
		this.sound_.startMusic();

		this.keyboardStuff();
		this.fullscreenStuff();
		dom.show(".overlay.titles");

		return Promise.resolve();
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

	update(timeStep: number) {
		const scene = this.scene;
		const now = sd.App.globalTime;

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
			this.hideMessage = 9e10;
		}

		if (this.mode === "play") {
			// allow movement
			this.playerCtl.step(timeStep);			

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

		// camera positioning, incl. earthquake effect
		const finalEye = this.playerCtl.view.pos;
		vec2.add(finalEye, finalEye, this.playerCtl.shakeOffset);
		this.scene.camera.lookAt(finalEye, this.playerCtl.view.focusPos, this.playerCtl.view.up);
	}
}


sd.App.messages.listenOnce("AppStart", undefined, () => {
	const stageHolder = dom.$1(".stageholder");
	const rw = new render.RenderWorld(stageHolder, 1280, 720);
	const adev = audio.makeAudioDevice()!;

	rw.registerEffect(new LegacyEffect());

	const scene = new sd.Scene(rw, adev, {
		physicsConfig: physics.makeDefaultPhysicsConfig(),
		delegate: new LD39Scene()
	});
	sd.App.scene = scene;
});
