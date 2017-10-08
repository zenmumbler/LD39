// RUN! Before the Power runs out! - a game for LD39: Running out of Power
// (c) 2017 by Arthur Langereis — @zenmumbler

/// <reference path="imports.ts" />

namespace sd.render.effect {

	import SVT = ShaderValueType;
	
} // effect

namespace sd.render.gl1 {
	import AttrRole = meshdata.VertexAttributeRole;
	import SVT = ShaderValueType;

	function legacyVertexFunction(_ldata: LegacyEffectData): VertexFunction {
		return {
			in: [
				{ name: "vertexPos_model", type: SVT.Float3, role: AttrRole.Position, index: 0 },
				{ name: "vertexNormal", type: SVT.Float3, role: AttrRole.Normal, index: 1 },
				{ name: "vertexUV", type: SVT.Float2, role: AttrRole.UV, index: 2 },
			],
			out: [
				{ name: "vertexPos_world", type: SVT.Float4 },
				{ name: "vertexPos_cam", type: SVT.Float3 },
				{ name: "vertexNormal_cam", type: SVT.Float3 },
				{ name: "vertexUV_intp", type: SVT.Float2 },
			],

			constants: [
				{ name: "modelMatrix", type: SVT.Float4x4 },
				{ name: "modelViewMatrix", type: SVT.Float4x4 },
				{ name: "modelViewProjectionMatrix", type: SVT.Float4x4 },
				{ name: "normalMatrix", type: SVT.Float3x3 },
				{ name: "texScaleOffset", type: SVT.Float4 },
			],

			main: `
				gl_Position = modelViewProjectionMatrix * vec4(vertexPos_model, 1.0);
				vertexPos_world = modelMatrix * vec4(vertexPos_model, 1.0);
				vertexNormal_cam = normalMatrix * vertexNormal;
				vertexPos_cam = (modelViewMatrix * vec4(vertexPos_model, 1.0)).xyz;
				vertexUV_intp = (vertexUV * texScaleOffset.xy) + texScaleOffset.zw;
				// vertexColour_intp = vertexColour;
			`
		};
	}

	function legacyFragmentFunction(ldata: LegacyEffectData): FragmentFunction {
		return {
			in: [
				{ name: "vertexPos_world", type: SVT.Float4 },
				{ name: "vertexPos_cam", type: SVT.Float3 },
				{ name: "vertexNormal_cam", type: SVT.Float3 },
				{ name: "vertexUV_intp", type: SVT.Float2 },
			],
			outCount: 1,

			modules: [
				"shadowedTotalLightContrib",
				"tiledLight",
				"grading/srgb/basic",
				"legacy/colourResponse",
				"basicNormalMap",
				"DepthFog",
				"fog/depth/linear"
			],

			main: `
			SurfaceInfo si = calcSurfaceInfo();
			MaterialInfo mi = getMaterialInfo(si.UV);

			vec3 totalLight = totalDynamicLightContributionTiledForward(si, mi);
			totalLight += vec3(0.015, 0.01, 0.02);

			totalLight = applyDepthFog(totalLight * mi.albedo.rgb, length(vertexPos_cam));

			gl_FragColor = vec4(linearToSRGB(totalLight), 1.0);
			`
		};
	}

	export function makeLegacyShader(rd: GL1RenderDevice, ldata: LegacyEffectData): Shader {
		const vertexFunction = legacyVertexFunction(ldata);
		const fragmentFunction = legacyFragmentFunction(ldata);

		return {
			renderResourceType: ResourceType.Shader,
			renderResourceHandle: 0,
			defines: [
				{ name: "NO_SRGB_TEXTURES", value: +(rd.extSRGB === undefined) },
				{ name: "HAS_BASE_UV", value: 1 },
				{ name: "ALBEDO_MAP", value: ldata.diffuse ? 1 : 0 },
				{ name: "SPECULAR", value: +(ldata.specularFactor[3] !== 0) },
				{ name: "SPECULAR_MAP", value: 0 },
				{ name: "NORMAL_MAP", value: ldata.normal ? 1 : 0 },
				{ name: "HEIGHT_MAP", value: 0 },
			],
			vertexFunction,
			fragmentFunction
		};	
	}
} // gl1


interface LegacyEffectData extends render.EffectData {
	diffuse: render.Texture | undefined;
	normal: render.Texture | undefined;
	specularFactor: Float32Array;
	tint: Float32Array;
	texScaleOffset: Float32Array;
}

const LEDID = (ldata: LegacyEffectData) => (
	(ldata.diffuse ? 1 : 0) << 0 |
	(ldata.normal ? 1 : 0) << 1 |
	(ldata.specularFactor[3] ? 1 : 0) << 2
);

class LegacyEffect implements render.Effect {
	readonly name = "legacy";
	readonly id = 0x00073CAC9;

	private rd_: render.gl1.GL1RenderDevice;
	private lighting_: render.TiledLight;
	private sampler_: render.Sampler;
	private shaders_ = new Map<number, render.Shader>();

	fogColour = vec4.fromValues(0, 0, 0, 1);
	fogParams = vec4.fromValues(8.0, 11.5, 1, 0);

	attachToRenderWorld(rw: render.RenderWorld) {
		this.rd_ = rw.rd as render.gl1.GL1RenderDevice;
		this.lighting_ = rw.lighting;
		this.sampler_ = render.makeSampler();

		const rcmd = new render.RenderCommandBuffer();
		rcmd.allocate(this.sampler_);
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
		const ldata = evData as LegacyEffectData;
		const ledid = LEDID(ldata);
		let shader = this.shaders_.get(ledid);
		if (! shader) {
			shader = render.gl1.makeLegacyShader(this.rd_, ldata);
			toBuffer.allocate(shader);
			this.shaders_.set(ledid, shader);
		}

		const mv = mat4.multiply(mat4.create(), camera.viewMatrix, modelMatrix);
		const mvp = mat4.multiply(mat4.create(), camera.projectionMatrix, mv);
		const normMat = mat3.normalFromMat4(mat3.create(), mv);

		const lightingSampler = this.lighting_.lutTextureSampler;

		toBuffer.render({
			mesh,
			primGroup,
			textures: [
				(evData as LegacyEffectData).diffuse,
				(evData as LegacyEffectData).normal,
				undefined,
				undefined,
				undefined,
				undefined,
				lightingSampler.tex
			],
			samplers: [
				this.sampler_,
				this.sampler_,
				undefined,
				undefined,
				undefined,
				undefined,
				lightingSampler.samp
			],
			constants: [
				{ name: "modelMatrix", value: modelMatrix as Float32Array },
				{ name: "modelViewMatrix", value: mv },
				{ name: "modelViewProjectionMatrix", value: mvp },
				{ name: "normalMatrix", value: normMat },

				{ name: "fogColour", value: this.fogColour },
				{ name: "fogParams", value: this.fogParams },
				{ name: "lightLUTParam", value: this.lighting_.lutParam },
				{ name: "baseColour", value: ldata.tint },
				{ name: "specularFactor", value: ldata.specularFactor },
				{ name: "texScaleOffset", value: ldata.texScaleOffset }
			],
			pipeline: {
				depthTest: render.DepthTest.Less,
				depthWrite: true,
				shader,
				faceCulling: render.FaceCulling.Back
			}
		}, 0);
	}

	makeEffectData(): LegacyEffectData {
		return {
			__effectID: this.id,
			diffuse: undefined,
			normal: undefined,
			specularFactor: vec4.zero(),
			tint: vec4.one(),
			texScaleOffset: vec4.fromValues(1, 1, 0, 0)
		};
	}

	getTexture(evd: render.EffectData, name: string): render.Texture | undefined {
		if (name === "diffuse") {
			return (evd as LegacyEffectData).diffuse;
		}
		if (name === "normal") {
			return (evd as LegacyEffectData).normal;
		}
		return undefined;
	}
	setTexture(evd: render.EffectData, name: string, tex: render.Texture | undefined) {
		if (name === "diffuse") {
			(evd as LegacyEffectData).diffuse = tex;
		}
		else if (name === "normal") {
			(evd as LegacyEffectData).normal = tex;
		}
	}

	getVector(evd: render.EffectData, name: string, out: sd.ArrayOfNumber): sd.ArrayOfNumber | undefined {
		if (name === "tint") {
			vec4.copy(out, (evd as LegacyEffectData).tint);
		}
		else if (name === "texScaleOffset") {
			vec4.copy(out, (evd as LegacyEffectData).texScaleOffset);
		}
		else if (name === "specularFactor") {
			vec4.copy(out, (evd as LegacyEffectData).specularFactor);
		}
		return out;
	}
	setVector(evd: render.EffectData, name: string, vec: sd.ArrayOfConstNumber) {
		if (name === "tint") {
			vec4.copy((evd as LegacyEffectData).tint, vec);
		}
		else if (name === "texScaleOffset") {
			vec4.copy((evd as LegacyEffectData).texScaleOffset, vec);
		}
		else if (name === "specularFactor") {
			vec4.copy((evd as LegacyEffectData).specularFactor, vec);
		}
	}

	getValue(evd: render.EffectData, name: string): number | undefined {
		return undefined;
	}
	setValue(evd: render.EffectData, name: string, val: number) {
	}

}
