// Untitled - a game for LD39: Running out of Power
// (c) 2017 by Arthur Langereis — @zenmumbler

/// <reference path="imports.ts" />
/// <reference path="basiceffect.ts" />

interface GameObject {
	entity: entity.Entity;
	transform: entity.TransformInstance;
	collider: entity.ColliderInstance;
	mesh: entity.MeshInstance;
	effectData: render.EffectData;
}

class LD39Scene implements sd.SceneDelegate {
	scene: sd.Scene;
	basic: render.Effect;
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

		this.basic = this.scene.rd.effectByName("basic")!;
		this.bed = this.basic.makeEffectData();
		this.basic.setTexture(this.bed, "diffuse", this.tex);

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

		this.sphereObject = makeGO(1, [0, 2.5, 0], this.sphere, this.sphereShape);
		this.boxObject = makeGO(0, [0, 0, 0.7], this.box, this.boxShape);

		return Promise.resolve();
	}

	update(timeStep: number) {
		this.t += timeStep;
		this.basic.setVector(this.bed, "tint", new Float32Array([1, .5 + .5 * Math.sin(this.t), 0]));
		this.scene.camera.lookAt([4, 0.7, 0], [0, 0.7, 0], [0, 1, 0]);
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

		cmds.setFrameBuffer(null, render.ClearMask.ColourDepth, { colour: [0.08, 0.07, 0.06, 1.0] });
		this.basic.addRenderJobs(this.sphereObject.effectData, this.scene.camera, scene.transforms.worldMatrix(this.sphereObject.transform), this.sphere, this.sphere.subMeshes[0], cmds);
		this.basic.addRenderJobs(this.boxObject.effectData, this.scene.camera, scene.transforms.worldMatrix(this.boxObject.transform), this.box, this.box.subMeshes[0], cmds);

		return cmds;
	}
}


sd.App.messages.listenOnce("AppStart", undefined, () => {
	// -- create managers
	const canvas = document.getElementById("stage") as HTMLCanvasElement;
	const rdev = new render.gl1.GL1RenderDevice(canvas);
	const adev = audio.makeAudioDevice()!;

	rdev.registerEffect(new BasicEffect());

	const scene = new sd.Scene(rdev, adev, {
		assetURLMapping: {},
		physicsConfig: physics.makeDefaultPhysicsConfig(),
		delegate: new LD39Scene()
	});
	sd.App.scene = scene;
});
