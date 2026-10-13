import { AdditiveBlending, Color, DoubleSide, ShaderMaterial } from "three";

/**
 * 홀로그램 재질: 가장자리가 밝게 빛나고(프레넬) 가로 주사선이 위로 흐르며, 전체가 깜빡인다.
 * uGlitch 가 0 보다 크면 가로 띠들이 옆으로 어긋나고 일부가 끊긴다 (월드 단위).
 * uTime · uFlicker · uGlitch 는 매 프레임 바꾼다. 더하기 섞기라 뒤가 비쳐 보인다
 */
export function hologramMaterial(color: string, { base = 0.1, rim = 1, lines = 1.4 } = {}): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uTime: { value: 0 },
      uFlicker: { value: 1 },
      uGlitch: { value: 0 },
      uBase: { value: base },
      uRim: { value: rim },
      uLines: { value: lines },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uGlitch;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vY;
      varying float vCut;
      float hash(float n) { return fract(sin(n * 91.345) * 43758.5453); }
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        // 지직거릴 때: 높이별 띠마다 옆으로 밀고, 몇몇 띠는 지운다
        float band = floor(world.y / max(uGlitch, 0.0001) * 0.15 + floor(uTime * 12.0) * 7.0);
        float r = hash(band);
        world.x += uGlitch * (r - 0.5) * step(0.72, r);
        vCut = uGlitch > 0.0 ? step(0.93, hash(band + 3.1)) : 0.0;
        vY = world.y;
        vec4 view = viewMatrix * world;
        vNormal = normalize(mat3(viewMatrix) * mat3(modelMatrix) * normal);
        vView = normalize(-view.xyz);
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uFlicker;
      uniform float uBase;
      uniform float uRim;
      uniform float uLines;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vY;
      varying float vCut;
      void main() {
        if (vCut > 0.5) discard;
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
        float scan = 0.55 + 0.45 * sin(vY * uLines - uTime * 5.0);
        float band = smoothstep(0.94, 1.0, fract(vY * 0.006 - uTime * 0.1));
        float alpha = (uBase + fresnel * uRim) * scan * uFlicker + band * 0.3;
        gl_FragColor = vec4(uColor * (0.6 + fresnel * 1.4 + band), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
}
