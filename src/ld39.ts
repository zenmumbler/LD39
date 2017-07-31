// RUN! Before the Power runs out! - a game for LD39: Running out of Power
// (c) 2017 by Arthur Langereis — @zenmumbler

/// <reference path="imports.ts" />
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
	sphere: meshdata.MeshData;
	box: meshdata.MeshData;
	sphereShape: physics.PhysicsShape;
	boxShape: physics.PhysicsShape;
	sphereObject: GameObject;
	boxObject: GameObject;
	t = 0;

	loadAssets(): Promise<render.RenderCommandBuffer> {
		const assets = [
			image.loadImage(io.localURL("data/TexturesCom_MarblePolishedRed_diffuse_M.png")),
		];

		return Promise.all(assets).then(
			([img]) => {
				this.tex = render.makeTex2DFromProvider(img, render.MipMapMode.Regenerate);

				const cubeHalfExt = 0.7;
				this.sphere = meshdata.gen.generate(new meshdata.gen.Sphere({ radius: 1, rows: 16, segs: 16 }));
				this.box = meshdata.gen.generate(new meshdata.gen.Box(meshdata.gen.cubeDescriptor(cubeHalfExt * 2)));

				this.sphereShape = physics.makeShape({
					type: physics.PhysicsShapeType.Sphere,
					radius: 1
				})!;
				this.boxShape = physics.makeShape({
					type: physics.PhysicsShapeType.Box,
					halfExtents: [cubeHalfExt, cubeHalfExt, cubeHalfExt]
				})!;

				const rcb = new render.RenderCommandBuffer();
				rcb.allocate(this.tex);
				rcb.allocate(this.sphere);
				rcb.allocate(this.box);
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

		this.sphereObject = makeGO(1, [0, 3, 0], this.sphere, this.sphereShape);
		this.boxObject = makeGO(0, [0, 0, 0.7], this.box, this.boxShape);
		makeLight([1.5, .7, 0], {
			type: entity.LightType.Point,
			colour: [1, 1, 1],
			intensity: 2,
			range: 1.8
		});
		makeLight([.8, -.5, 1.2], {
			type: entity.LightType.Point,
			colour: [0, 1, 0],
			intensity: 1,
			range: 1
		});

		return Promise.resolve();
	}

	update(timeStep: number) {
		this.t += timeStep;
		// this.legacy.setVector(this.bed, "tint", new Float32Array([1, .5 + .5 * Math.sin(this.t), 0, 0]));
		this.scene.camera.lookAt([4.5, 1.2, 2.5], [0, 0.7, 0], [0, 1, 0]);
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
		this.legacy.addRenderJobs(this.sphereObject.effectData!, this.scene.camera, scene.transforms.worldMatrix(this.sphereObject.transform), this.sphere, this.sphere.subMeshes[0], cmds);
		this.legacy.addRenderJobs(this.boxObject.effectData!, this.scene.camera, scene.transforms.worldMatrix(this.boxObject.transform), this.box, this.box.subMeshes[0], cmds);

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
