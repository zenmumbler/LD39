// ZAMBIES - a game for LD39: Running out of Power
// (c) 2017 by Arthur Langereis — @zenmumbler

/// <reference path="imports.ts" />

namespace sd.render.gl1 {
	import AttrRole = meshdata.VertexAttributeRole;
	import SVT = ShaderValueType;

	function legacyVertexFunction(): GL1VertexFunction {
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
			],

			main: `
				gl_Position = modelViewProjectionMatrix * vec4(vertexPos_model, 1.0);
				vertexPos_world = modelMatrix * vec4(vertexPos_model, 1.0);
				vertexNormal_cam = normalMatrix * vertexNormal;
				vertexPos_cam = (modelViewMatrix * vec4(vertexPos_model, 1.0)).xyz;
				vertexUV_intp = vertexUV; // (vertexUV * texScaleOffset.xy) + texScaleOffset.zw;
				// vertexColour_intp = vertexColour;
			`
		};
	}

	function legacyFragmentFunction(): GL1FragmentFunction {
		return {
			in: [
				{ name: "vertexPos_world", type: SVT.Float4 },
				{ name: "vertexPos_cam", type: SVT.Float3 },
				{ name: "vertexNormal_cam", type: SVT.Float3 },
				{ name: "vertexUV_intp", type: SVT.Float2 },
			],
			outCount: 1,

			samplers: [
				{ name: "diffuseSampler", type: render.TextureClass.Plain, index: 0 },
				// { name: "normalSampler", type: render.TextureClass.Plain, index: 1 },
				{ name: "lightLUTSampler", type: render.TextureClass.Plain, index: 1 }
			],

			constants: [
				{ name: "mainColour", type: SVT.Float4 },
				{ name: "fogColour", type: SVT.Float4 },
				{ name: "fogParams", type: SVT.Float4 },
				{ name: "lightLUTParam", type: SVT.Float2 }
			],

			constValues: [
				{ name: "FOGPARAM_START", type: SVT.Int, expr: "0" },
				{ name: "FOGPARAM_DEPTH", type: SVT.Int, expr: "1" },
				{ name: "FOGPARAM_DENSITY", type: SVT.Int, expr: "2" },
			],

			code: `
struct LightEntry {
	vec4 colourAndType;
	vec4 positionCamAndIntensity;
	vec4 positionWorldAndRange;
	vec4 directionAndCutoff;
	vec4 shadowStrengthBias;
};

LightEntry getLightEntry(float lightIx) {
	float row = (floor(lightIx / 64.0) + 0.5) / 256.0;
	float col = (mod(lightIx, 64.0) * 5.0) + 0.5;
	LightEntry le;
	le.colourAndType = texture2D(lightLUTSampler, vec2(col / 320.0, row));
	le.positionCamAndIntensity = texture2D(lightLUTSampler, vec2((col + 1.0) / 320.0, row));
	le.positionWorldAndRange = texture2D(lightLUTSampler, vec2((col + 2.0) / 320.0, row));
	le.directionAndCutoff = texture2D(lightLUTSampler, vec2((col + 3.0) / 320.0, row));
	le.shadowStrengthBias = texture2D(lightLUTSampler, vec2((col + 4.0) / 320.0, row));
	return le;
}

float getLightIndex(float listIndex) {
	float liRow = (floor(listIndex / 1280.0) + 128.0 + 0.5) / 256.0;
	float rowElementIndex = mod(listIndex, 1280.0);
	float liCol = (floor(rowElementIndex / 4.0) + 0.5) / 320.0;
	float element = floor(mod(rowElementIndex, 4.0));
	vec4 packedIndices = texture2D(lightLUTSampler, vec2(liCol, liRow));
	// gles2: only constant index accesses allowed
	if (element < 1.0) return packedIndices[0];
	if (element < 2.0) return packedIndices[1];
	if (element < 3.0) return packedIndices[2];
	return packedIndices[3];
}

vec2 getLightGridCell(vec2 fragCoord) {
	vec2 lightGridPos = vec2(floor(fragCoord.x / 32.0), floor(fragCoord.y / 32.0));
	float lightGridIndex = (lightGridPos.y * lightLUTParam.x) + lightGridPos.x;

	float lgRow = (floor(lightGridIndex / 640.0) + 128.0 + 120.0 + 0.5) / 256.0;
	float rowPairIndex = mod(lightGridIndex, 640.0);
	float lgCol = (floor(rowPairIndex / 2.0) + 0.5) / 320.0;
	float pair = floor(mod(rowPairIndex, 2.0));
	// gles2: only constant index accesses allowed
	vec4 cellPair = texture2D(lightLUTSampler, vec2(lgCol, lgRow));
	if (pair < 1.0) return cellPair.xy;
	return cellPair.zw;
}

vec3 calcLightShared(vec3 lightColour, float intensity, float diffuseStrength, vec3 lightDirection, vec3 normal_cam) {
	float NdL = max(0.0, dot(normal_cam, lightDirection));
	vec3 diffuseContrib = lightColour * diffuseStrength * NdL * intensity;

	// vec3 specularContrib = vec3(0.0);
	// vec3 viewVec = normalize(-vertexPos_cam);
	// vec3 reflectVec = reflect(lightDirection, normal_cam);
	// float specularStrength = dot(viewVec, reflectVec);
	// if (specularStrength > 0.0) {
	// if (feat & Features.SpecularMap) {
	// 		vec3 specularColour = texture2D(specularSampler, vertexUV_intp).xyz;
	// }
	// else {
	// 		vec3 specularColour = lightColour;
	// }
	// 	specularStrength = pow(specularStrength, specular[SPEC_EXPONENT]) * diffuseStrength; // FIXME: not too sure about this (* diffuseStrength)
	// 	specularContrib = specularColour * specularStrength * specular[SPEC_INTENSITY];
	// }
	// return diffuseContrib + specularContrib;
	return diffuseContrib;
}

vec3 calcPointLight(vec3 lightColour, float intensity, float range, vec3 lightPos_cam, vec3 lightPos_world, vec3 normal_cam) {
	float distance = length(vertexPos_world.xyz - lightPos_world); // use world positions for distance as cam will warp coords
	vec3 lightDirection_cam = normalize(vertexPos_cam - lightPos_cam);
	float attenuation = clamp(1.0 - distance / range, 0.0, 1.0);
	attenuation *= attenuation;
	return calcLightShared(lightColour, intensity, attenuation, lightDirection_cam, normal_cam);
}

vec3 calcSpotLight(vec3 lightColour, float intensity, float range, float cutoff, vec3 lightPos_cam, vec3 lightPos_world, vec3 lightDirection, vec3 normal_cam) {
	vec3 lightToPoint = normalize(vertexPos_cam - lightPos_cam);
	float spotCosAngle = dot(lightToPoint, lightDirection);
	if (spotCosAngle > cutoff) {
		vec3 light = calcPointLight(lightColour, intensity, range, lightPos_cam, lightPos_world, normal_cam);
		return light * smoothstep(cutoff, cutoff + 0.006, spotCosAngle);
	}
	return vec3(0.0);
}

vec3 getLightContribution(LightEntry light, vec3 normal_cam) {
	vec3 colour = light.colourAndType.xyz;
	float type = light.colourAndType.w;
	vec3 lightPos_cam = light.positionCamAndIntensity.xyz;
	float intensity = light.positionCamAndIntensity.w;

	if (type == ${entity.LightType.Directional}.0) {
		return calcLightShared(colour, intensity, 1.0, light.directionAndCutoff.xyz, normal_cam);
	}

	vec3 lightPos_world = light.positionWorldAndRange.xyz;
	float range = light.positionWorldAndRange.w;
	if (type == ${entity.LightType.Point}.0) {
		return calcPointLight(colour, intensity, range, lightPos_cam, lightPos_world, normal_cam);
	}

	float cutoff = light.directionAndCutoff.w;
	if (type == ${entity.LightType.Spot}.0) {
		return calcSpotLight(colour, intensity, range, cutoff, lightPos_cam, lightPos_world, light.directionAndCutoff.xyz, normal_cam);
	}

	return vec3(0.0); // this would be bad
}
			`,

			main: `
				vec3 texColour = texture2D(diffuseSampler, vertexUV_intp).rgb;
				vec3 matColour = mainColour.rgb * texColour;
				vec3 normal_cam = normalize(vertexNormal_cam);

				vec3 totalLight = vec3(0.0);

				vec2 fragCoord = vec2(gl_FragCoord.x, lightLUTParam.y - gl_FragCoord.y);
				vec2 lightOffsetCount = getLightGridCell(fragCoord);
				int lightListOffset = int(lightOffsetCount.x);
				int lightListCount = int(lightOffsetCount.y);

				for (int llix = 0; llix < 128; ++llix) {
					if (llix == lightListCount) break; // hack to overcome gles2 limitation where loops need constant max counters 

					float lightIx = getLightIndex(float(lightListOffset + llix));
					LightEntry lightData = getLightEntry(lightIx);
					if (lightData.colourAndType.w <= 0.0) break;

					totalLight += getLightContribution(lightData, normal_cam);
				}

				float fogDensity = clamp((length(vertexPos_cam) - fogParams[FOGPARAM_START]) / fogParams[FOGPARAM_DEPTH], 0.0, fogParams[FOGPARAM_DENSITY]);
				totalLight = mix(totalLight * matColour, fogColour.rgb, fogDensity);

				gl_FragColor = vec4(pow(totalLight, vec3(1.0 / 2.2)), 1.0);
				// gl_FragColor = vec4(totalLight, 1.0);
			`
		};
	}

	export function makeLegacyShader(): Shader {
		const vertexFunction = legacyVertexFunction();
		const fragmentFunction = legacyFragmentFunction();

		return {
			renderResourceType: ResourceType.Shader,
			renderResourceHandle: 0,
			vertexFunction,
			fragmentFunction
		};	
	}
} // gl1


interface LegacyEffectData extends render.EffectData {
	diffuse: render.Texture | undefined;
	tint: Float32Array;
}

class LegacyEffect implements render.Effect {
	readonly name = "legacy";

	private rd_: render.gl1.GL1RenderDevice;
	private sampler_: render.Sampler;
	private shader_: render.Shader;

	fogColour = vec4.fromValues(0, 0, 0, 1);
	fogParams = vec4.fromValues(10.0, 5.0, 0.8, 0);

	private lighting: system.Lighting;

	useLightingSystem(lighting: system.Lighting) {
		this.lighting = lighting;
	}

	linkWithDevice(rd: render.RenderDevice) {
		this.rd_ = rd as render.gl1.GL1RenderDevice;
		this.sampler_ = render.makeSampler();
		this.shader_ = render.gl1.makeLegacyShader();

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
		const mv = mat4.multiply(mat4.create(), camera.viewMatrix, modelMatrix);
		const mvp = mat4.multiply(mat4.create(), camera.viewProjMatrix, modelMatrix);
		const normMat = mat3.normalFromMat4(mat3.create(), mvp);

		const lightingSampler = this.lighting.lutTextureSampler;

		toBuffer.render({
			mesh,
			primGroup,
			textures: [
				(evData as LegacyEffectData).diffuse,
				lightingSampler.tex
			],
			samplers: [
				this.sampler_,
				lightingSampler.samp
			],
			constants: [
				{ name: "modelMatrix", value: modelMatrix as Float32Array },
				{ name: "modelViewMatrix", value: mv },
				{ name: "modelViewProjectionMatrix", value: mvp },
				{ name: "normalMatrix", value: normMat },

				{ name: "fogColour", value: this.fogColour },
				{ name: "fogParams", value: this.fogParams },
				{ name: "lightLUTParam", value: this.lighting.lutParam },
				{ name: "mainColour", value: (evData as LegacyEffectData).tint }
			],
			pipeline: {
				depthTest: render.DepthTest.Less,
				depthWrite: true,
				shader: this.shader_,
				faceCulling: render.FaceCulling.Back
			}
		}, 0);
	}

	makeEffectData(): LegacyEffectData {
		return {
			diffuse: undefined,
			tint: vec4.one()
		};
	}

	getTexture(evd: render.EffectData, name: string): render.Texture | undefined {
		return (evd as LegacyEffectData).diffuse;
	}
	setTexture(evd: render.EffectData, name: string, tex: render.Texture | undefined) {
		(evd as LegacyEffectData).diffuse = tex;
	}

	getVector(evd: render.EffectData, name: string, out: sd.ArrayOfNumber): sd.ArrayOfNumber | undefined {
		vec4.copy(out, (evd as LegacyEffectData).tint);
		return out;
	}
	setVector(evd: render.EffectData, name: string, vec: sd.ArrayOfConstNumber) {
		vec4.copy((evd as LegacyEffectData).tint, vec);
	}

	getValue(evd: render.EffectData, name: string): number | undefined {
		return undefined;
	}
	setValue(evd: render.EffectData, name: string, val: number) {
	}
}
