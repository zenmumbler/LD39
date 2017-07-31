// Untitled - a game for LD39: Running out of Power
// (c) 2017 by Arthur Langereis — @zenmumbler

/// <reference path="imports.ts" />

namespace sd.render.gl1 {
	import AttrRole = meshdata.VertexAttributeRole;
	import SVT = ShaderValueType;

	function basicVertexFunction(): GL1VertexFunction {
		return {
			in: [
				{ name: "vertexPos_model", type: SVT.Float3, role: AttrRole.Position, index: 0 },
				{ name: "vertexNormal", type: SVT.Float3, role: AttrRole.Normal, index: 1 },
				{ name: "vertexUV", type: SVT.Float2, role: AttrRole.UV, index: 2 },
			],
			out: [
				// { name: "vertexPos_world", type: SVT.Float4 },
				// { name: "vertexPos_cam", type: SVT.Float3 },
				{ name: "vertexNormal_cam", type: SVT.Float3 },
				{ name: "vertexUV_intp", type: SVT.Float2 },
			],

			constants: [
				// { name: "modelMatrix", type: SVT.Float4x4 },
				// { name: "modelViewMatrix", type: SVT.Float4x4 },
				{ name: "modelViewProjectionMatrix", type: SVT.Float4x4 },
				{ name: "normalMatrix", type: SVT.Float3x3 },
			],

			main: `
				gl_Position = modelViewProjectionMatrix * vec4(vertexPos_model, 1.0);
				// vertexPos_world = modelMatrix * vec4(vertexPos_model, 1.0);
				vertexNormal_cam = normalMatrix * vertexNormal;
				// vertexPos_cam = (modelViewMatrix * vec4(vertexPos_model, 1.0)).xyz;
				vertexUV_intp = vertexUV;
			`
		};
	}

	function basicFragmentFunction(): GL1FragmentFunction {
		return {
			in: [
				// { name: "vertexPos_world", type: SVT.Float4 },
				// { name: "vertexPos_cam", type: SVT.Float3 },
				{ name: "vertexNormal_cam", type: SVT.Float3 },
				{ name: "vertexUV_intp", type: SVT.Float2 },
			],
			outCount: 1,

			samplers: [
				{ name: "diffuseSampler", type: render.TextureClass.Plain, index: 0 }
			],

			constants: [
				{ name: "mainColour", type: SVT.Float4 }
			],

			main: `
				// gl_FragColor = vec4((vertexNormal_cam / 2.0) + 0.5, 1.0);
				vec3 diffuse = texture2D(diffuseSampler, vertexUV_intp).rgb;
				gl_FragColor = vec4(pow(diffuse * mainColour.rgb, vec3(1.0 / 2.2)), 1.0);
			`
		};
	}

	export function makeBasicShader(): Shader {
		const vertexFunction = basicVertexFunction();
		const fragmentFunction = basicFragmentFunction();

		return {
			renderResourceType: ResourceType.Shader,
			renderResourceHandle: 0,
			vertexFunction,
			fragmentFunction
		};	
	}
} // gl1


interface BasicEffectData extends render.EffectData {
	diffuse: render.Texture | undefined;
	tint: Float32Array;
}

class BasicEffect implements render.Effect {
	readonly name = "basic";

	private rd_: render.gl1.GL1RenderDevice;
	private sampler_: render.Sampler;
	private shader_: render.Shader;

	private tempMat4_ = mat4.create();
	private tempMat3_ = mat3.create();

	linkWithDevice(rd: render.RenderDevice) {
		this.rd_ = rd as render.gl1.GL1RenderDevice;
		this.sampler_ = render.makeSampler();
		this.shader_ = render.gl1.makeBasicShader();

		const rcmd = new render.RenderCommandBuffer();
		rcmd.allocate(this.sampler_);
		rcmd.allocate(this.shader_);
		this.rd_.dispatch(rcmd);
		this.rd_.processFrame();
	}

	addRenderJobs(
		evData: render.EffectData,
		camera: math.ProjectionSetup,
		modelMatrix: sd.Float4x4,
		mesh: meshdata.MeshData, primGroup: meshdata.PrimitiveGroup,
		toBuffer: render.RenderCommandBuffer
	) {
		const mvp = mat4.multiply(mat4.create(), camera.viewProjMatrix, modelMatrix);
		const normMat = mat3.normalFromMat4(mat3.create(), mvp);

		toBuffer.render({
			mesh,
			primGroup,
			textures: [(evData as BasicEffectData).diffuse!],
			samplers: [this.sampler_],
			constants: [
				{ name: "modelViewProjectionMatrix", value: mvp },
				{ name: "normalMatrix", value: normMat },
				{ name: "mainColour", value: (evData as BasicEffectData).tint }
			],
			pipeline: {
				depthTest: render.DepthTest.Less,
				depthWrite: true,
				shader: this.shader_,
				faceCulling: render.FaceCulling.Back
			}
		}, 0);
	}

	makeEffectData(): BasicEffectData {
		return {
			diffuse: undefined,
			tint: vec4.one()
		};
	}

	getTexture(evd: render.EffectData, name: string): render.Texture | undefined {
		return (evd as BasicEffectData).diffuse;
	}
	setTexture(evd: render.EffectData, name: string, tex: render.Texture | undefined) {
		(evd as BasicEffectData).diffuse = tex;
	}

	getVector(evd: render.EffectData, name: string, out: sd.ArrayOfNumber): sd.ArrayOfNumber | undefined {
		vec4.copy(out, (evd as BasicEffectData).tint);
		return out;
	}
	setVector(evd: render.EffectData, name: string, vec: sd.ArrayOfConstNumber) {
		vec4.copy((evd as BasicEffectData).tint, vec);
	}

	getValue(evd: render.EffectData, name: string): number | undefined {
		return undefined;
	}
	setValue(evd: render.EffectData, name: string, val: number) {
	}
}
