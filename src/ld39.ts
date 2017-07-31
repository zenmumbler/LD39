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
	bed: render.EffectData;
	tex: render.Texture;

	boxMesh: meshdata.MeshData;
	baseMesh: meshdata.MeshData;

	sound_: Sound;
	soundAssets: SoundAssets;

	boxShape: physics.PhysicsShape;
	baseShape: physics.PhysicsShape;
	boxes: GameObject[] = [];

	baseObject: GameObject;

	playerCtl: PlayerController;

	loadAssets(): Promise<render.RenderCommandBuffer> {
		this.sound_ = new Sound(this.scene.ad);
		this.soundAssets = { steps: [] as AudioBuffer[] } as SoundAssets;

		const assets = [
			image.loadImage(io.localURL("data/TexturesCom_MarblePolishedRed_diffuse_M.png")),

			sd.asset.loadOBJFile(io.localURL("data/base.obj")),

			loadSoundFile(this.scene.ad, "data/sound/Bart-Roijmans-Bigboss-looped.mp3").then(buf => { this.soundAssets.music = buf; }),
			loadSoundFile(this.scene.ad, "data/sound/34253__ddohler__hard-walking_0.mp3").then(buf => { this.soundAssets.steps[0] = buf; }),
			loadSoundFile(this.scene.ad, "data/sound/34253__ddohler__hard-walking_1.mp3").then(buf => { this.soundAssets.steps[1] = buf; }),
			loadSoundFile(this.scene.ad, "data/sound/381957__avensol__security-alarm.mp3").then(buf => { this.soundAssets.alarm = buf; }),
			loadSoundFile(this.scene.ad, "data/sound/363122__el-bee__landmass-earth-rumble.mp3").then(buf => { this.soundAssets.tremble = buf; }),
		];

		return Promise.all(assets as Promise<any>[]).then(
			([img, baseGroup]) => {
				this.tex = render.makeTex2DFromProvider(img as image.PixelDataProvider, render.MipMapMode.Regenerate);

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
				rcb.allocate(this.tex);
				rcb.allocate(this.boxMesh);
				rcb.allocate(this.baseMesh);
				return rcb;
			}
		);
	}

	buildWorld(): Promise<void> {
		const scene = this.scene;
		this.scene.camera.perspective(65, .1, 100);

		this.legacy = this.scene.rd.effectByName("legacy")!;
		(this.legacy as LegacyEffect).useLightingSystem(scene.lighting);

		this.bed = this.legacy.makeEffectData();
		this.legacy.setTexture(this.bed, "diffuse", this.tex);

		const makeGO = (mass: number, position: sd.ConstFloat3, meshData: meshdata.MeshData, shape: physics.PhysicsShape): GameObject => {
			const entity = scene.entities.create();
			const transform = scene.transforms.create(entity, { position });
			const collider = scene.colliders.create(entity, { rigidBody: {
				mass,
				shape
			}});
			const mesh = scene.meshes.create(meshData);
			scene.meshes.linkToEntity(mesh, entity);
			const effectData = this.bed;
			return { entity, transform, collider, mesh, effectData };
		};

		const makeLight = (position: sd.ConstFloat3, lightDesc: entity.Light): GameObject => {
			const entity = scene.entities.create();
			const transform = scene.transforms.create(entity, { position });
			const light = scene.lights.create(entity, lightDesc);
			return { entity, transform, light };
		};

		makeLight([0, 2.8, 2], {
			type: entity.LightType.Point,
			colour: [1, 1, 1],
			intensity: 1.5,
			range: 5
		});
		makeLight([0, 2.8, 10], {
			type: entity.LightType.Point,
			colour: [1, 1, 1],
			intensity: 1.5,
			range: 5
		});

		this.boxes.push(makeGO(.5, [-1, .3, 7], this.boxMesh, this.boxShape));
		this.baseObject = makeGO(0, [0, 0, 0], this.baseMesh, this.baseShape);

		this.playerCtl = new PlayerController(dom.$1("#stage"), [0, 1.1, 0], scene, this.sound_);
		this.sound_.setAssets(this.soundAssets);
		this.sound_.startMusic();

		return Promise.resolve();
	}

	update(timeStep: number) {
		this.playerCtl.step(timeStep);
		const finalEye = this.playerCtl.view.pos;
		vec2.add(finalEye, finalEye, this.playerCtl.shakeOffset);
		this.scene.camera.lookAt(finalEye, this.playerCtl.view.focusPos, this.playerCtl.view.up);
	}

	frame(timeStep: number) {
		const scene = this.scene;

		this.update(timeStep);
		scene.physics.update(timeStep);

		// creating render commands
		const cmds = scene.lighting.prepareLightsForRender(
			scene.lights.allEnabled(),
			scene.camera,
			scene.camera.viewport
		);

		cmds.setFrameBuffer(null, render.ClearMask.ColourDepth, { colour: [0.3, 0.3, 0.3, 1.0] });
		for (const box of this.boxes) {
			this.legacy.addRenderJobs(box.effectData!, this.scene.camera, scene.transforms.worldMatrix(box.transform), this.boxMesh, this.boxMesh.subMeshes[0], cmds);
		}
		for (const bsm of this.baseMesh.subMeshes) {
			this.legacy.addRenderJobs(this.baseObject.effectData!, this.scene.camera, scene.transforms.worldMatrix(this.baseObject.transform), this.baseMesh, bsm, cmds);
		}

		return cmds;
	}
}


sd.App.messages.listenOnce("AppStart", undefined, () => {
	// -- create managers
	const canvas = document.getElementById("stage") as HTMLCanvasElement;
	const rdev = new render.gl1.GL1RenderDevice(canvas);
	const adev = audio.makeAudioDevice()!;

	rdev.registerEffect(new LegacyEffect());

	const scene = new sd.Scene(rdev, adev, {
		assetURLMapping: {},
		physicsConfig: physics.makeDefaultPhysicsConfig(),
		delegate: new LD39Scene()
	});
	sd.App.scene = scene;
});
