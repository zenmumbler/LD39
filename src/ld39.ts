// Untitled - a game for LD39: Running out of Power
// (c) 2017 by Arthur Langereis — @zenmumbler

/// <reference path="imports.ts" />
/// <reference path="basiceffect.ts" />

class LD39Scene implements sd.SceneDelegate {
	scene: sd.Scene;
	basic: render.Effect;

	loadAssets(): Promise<render.RenderCommandBuffer> {
		const assets: Promise<void>[] = [
			// image.loadImage(io.localURL("data/xxx.png")),
		];

		return Promise.all(assets).then(
			([png]) => {
				// this.tex = render.makeTex2DFromProvider(png);

				const rcb = new render.RenderCommandBuffer();
				// rcb.allocate(this.tex);
				return rcb;
			}
		);
	}

	buildWorld(): Promise<void> {
		this.scene.camera.perspective(65, .1, 100);

		this.basic = this.scene.rd.effectByName("basic")!;
		// this.bed = this.basic.makeEffectData();
		// this.basic.setTexture(this.bed, "diffuse", this.tex);

		return Promise.resolve();
	}

	update(timeStep: number) {
		// this.basic.setVector(this.bed, "tint", new Float32Array([1, .5 + .5 * Math.sin(this.t), 0]));
		this.scene.camera.lookAt([2, 0, 0], [0, 0, 0], [0, 1, 0]);
	}

	frame(timeStep: number) {
		this.update(timeStep);
		const scene = this.scene;

		// creating render commands
		const cmds = scene.lighting.prepareLightsForRender(
			scene.lights.allEnabled(),
			scene.camera,
			scene.camera.viewport
		);

		cmds.setFrameBuffer(null, render.ClearMask.ColourDepth, { colour: [0.08, 0.07, 0.06, 1.0] });
		// this.basic.addRenderJobs(this.bed, this.scene.camera, mat4.create(), this.sphere, this.sphere.subMeshes[0], cmds);

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
		delegate: new LD39Scene()
	});
	sd.App.scene = scene;
});
