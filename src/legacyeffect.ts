// RUN! Before the Power runs out! - a game for LD39: Running out of Power
// (c) 2017 by Arthur Langereis — @zenmumbler

/// <reference path="imports.ts" />

namespace sd.render.shader {
	import SVT = ShaderValueType;
	
	gl1Modules.diffuseSpecularLight = {
		name: "diffuseSpecularLight",
		requires: [
			"SurfaceInfo",
			"MaterialInfo",
		],
		samplers: [
			{ name: "specularSampler", type: TextureClass.Plain, index: 2, ifExpr: "SPECULAR_MAP" }
		],
		provides: [
			"CoreLight"
		],
		code: `
		vec3 calcLightShared(vec3 lightColour, float diffuseStrength, vec3 lightDirection_cam, SurfaceInfo si, MaterialInfo mi) {
			float NdL = max(0.0, dot(si.N, -lightDirection_cam));
			vec3 diffuseContrib = lightColour * diffuseStrength * NdL;
		
		#ifdef SPECULAR
			vec3 specularContrib = vec3(0.0);
			vec3 viewVec = normalize(si.V);
			vec3 reflectVec = reflect(lightDirection_cam, si.N);
			float specularStrength = dot(viewVec, reflectVec);
			if (specularStrength > 0.0) {
			#ifdef SPECULAR_MAP
				vec3 specularColour = texture2D(specularSampler, si.UV).rgb * mi.specularFactor;
			#else
				vec3 specularColour = mi.specularFactor;
			#endif
				specularStrength = pow(specularStrength, mi.specularExponent) * diffuseStrength; // FIXME: not too sure about this (* diffuseStrength)
				specularContrib = specularColour * specularStrength;
				diffuseContrib += specularContrib;
			}
		#endif

			return diffuseContrib;
		}
		`
	};

	gl1Modules.basicNormalMap = {
		name: "basicNormalMap",
		provides: [
			"NormalMap"
		],
		samplers: [
			{ name: "normalMap", type: TextureClass.Plain, index: 1, ifExpr: "NORMAL_MAP" }
		],
		code: `
		#ifdef NORMAL_MAP
		vec3 getMappedNormal(vec2 uv) {
			return texture2D(normalMap, uv).xyz * 2.0 - 1.0;
		}
		#endif
		`
	};

	gl1Modules.simpleSurfaceInfo = {
		name: "simpleSurfaceInfo",
		requires: [
			// "mathUtils",
			"normalPerturbation",
			"NormalMap"
		],
		provides: [
			"SurfaceInfo"
		],
		structs: [{
			name: "SurfaceInfo",
			code: `
			struct SurfaceInfo {
				vec3 V;  // vertex dir (cam)
				vec3 N;  // surface normal (cam)
			#ifdef HAS_BASE_UV
				vec2 UV; // (adjusted) main UV
			#endif
			};
			`
		}],
		constants: [
			{ name: "normalMatrix", type: SVT.Float3x3 }
		],
		code: `
		SurfaceInfo calcSurfaceInfo() {
			SurfaceInfo si;
			si.V = normalize(-vertexPos_cam);
			si.N = normalize(vertexNormal_cam);
			#if defined(HEIGHT_MAP) || defined(NORMAL_MAP)
				mat3 TBN = cotangentFrame(si.N, vertexPos_cam, vertexUV_intp);
			#endif
			#ifdef HEIGHT_MAP
				vec3 eyeTan = normalize(inverse(TBN) * si.V);
				// <-- adjust uv using heightmap
				si.UV = vertexUV_intp;
			#elif defined(HAS_BASE_UV)
				si.UV = vertexUV_intp;
			#endif
			#ifdef NORMAL_MAP
				vec3 mapNormal = getMappedNormal(si.UV);
				// mapNormal.y = -mapNormal.y;
				si.N = normalize(TBN * mapNormal);
			#endif
			return si;
		}
		`
	};

	gl1Modules.simpleMaterialInfo = {
		name: "simpleMaterialInfo",
		requires: [
			"ConvertSRGB",			
		],
		provides: [
			"MaterialInfo"
		],
		constants: [
			{ name: "baseColour", type: SVT.Float4 },
		],
		samplers: [
			{ name: "albedoMap", type: TextureClass.Plain, index: 0, ifExpr: "ALBEDO_MAP" },
		],
		structs: [
			{
				name: "MaterialInfo",
				code: `
				struct MaterialInfo {
					vec4 albedo;
				};
				`
			}
		],
		code: `
		MaterialInfo getMaterialInfo(vec2 materialUV) {
			MaterialInfo mi;
			vec3 colour = srgbToLinear(baseColour.rgb);
			#ifdef ALBEDO_MAP
				vec3 mapColour = texture2D(albedoMap, materialUV).rgb;
				#ifdef NO_SRGB_TEXTURES
					mapColour = srgbToLinear(mapColour);
				#endif
				colour *= mapColour;
			#endif
			mi.albedo = vec4(colour, 1.0);
			return mi;
		}
		`
	};

} // ns sd.render.shader

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
				"lightContrib",
				"tiledLight",
				"basicSRGB",
				"simpleMaterialInfo",
				"simpleSurfaceInfo",
				"diffuseSpecularLight",
				"basicNormalMap"
			],

			constants: [
				{ name: "fogColour", type: SVT.Float4 },
				{ name: "fogParams", type: SVT.Float4 },
			],

			constValues: [
				{ name: "FOGPARAM_START", type: SVT.Int, expr: "0" },
				{ name: "FOGPARAM_DEPTH", type: SVT.Int, expr: "1" },
				{ name: "FOGPARAM_DENSITY", type: SVT.Int, expr: "2" },
			],

			main: `
			SurfaceInfo si = calcSurfaceInfo();
			MaterialInfo mi = getMaterialInfo(si.UV);

			vec3 totalLight = vec3(0.015, 0.01, 0.02);

			vec2 fragCoord = vec2(gl_FragCoord.x, lightLUTParam.y - gl_FragCoord.y);
			vec2 lightOffsetCount = getLightGridCell(fragCoord);
			int lightListOffset = int(lightOffsetCount.x);
			int lightListCount = int(lightOffsetCount.y);

			for (int llix = 0; llix < 128; ++llix) {
				if (llix == lightListCount) break; // hack to overcome gles2 limitation where loops need constant max counters 

				float lightIx = getLightIndex(float(lightListOffset + llix));
				LightEntry lightData = getLightEntry(lightIx);
				if (lightData.colourAndType.w <= 0.0) break;

				totalLight += getLightContribution(lightData, si, mi);
			}

			float fogDensity = clamp((length(vertexPos_cam) - fogParams[FOGPARAM_START]) / fogParams[FOGPARAM_DEPTH], 0.0, fogParams[FOGPARAM_DENSITY]);
			totalLight = mix(totalLight * mi.albedo.rgb, fogColour.rgb, fogDensity);
			// totalLight = totalLight * mi.albedo.rgb;

			gl_FragColor = vec4(pow(totalLight, vec3(1.0 / 2.2)), 1.0);
			// gl_FragColor = vec4(totalLight, 1.0);
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
				{ name: "SPECULAR", value: +(ldata.specular) },
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
	specular: boolean;
	tint: Float32Array;
	texScaleOffset: Float32Array;
}

const LEDID = (ldata: LegacyEffectData) => (
	(ldata.diffuse ? 1 : 0) << 0 |
	(ldata.normal ? 1 : 0) << 1 |
	(ldata.specular ? 1 : 0) << 2
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
			specular: false,
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
		return out;
	}
	setVector(evd: render.EffectData, name: string, vec: sd.ArrayOfConstNumber) {
		if (name === "tint") {
			vec4.copy((evd as LegacyEffectData).tint, vec);
		}
		else if (name === "texScaleOffset") {
			vec4.copy((evd as LegacyEffectData).texScaleOffset, vec);
		}
	}

	getValue(evd: render.EffectData, name: string): number | undefined {
		if (name === "specular") {
			return +(evd as LegacyEffectData).specular;
		}
		return undefined;
	}
	setValue(evd: render.EffectData, name: string, val: number) {
		if (name === "specular") {
			(evd as LegacyEffectData).specular = !!val;
		}
	}
}
