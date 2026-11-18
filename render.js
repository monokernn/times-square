import { THREE as T, texture, v3 } from "./geometry.js";
const noise = `
 float hash(vec2 v){return fract(sin(dot(mod(v,1000.),vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 v){vec2 i=floor(v),f=fract(v);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
`;
function target(w = 1, h = 1, options = {}) {
  return new T.WebGLRenderTarget(w, h, {
    type: T.HalfFloatType,
    depthBuffer: true,
    ...options,
  });
}
const fullVertex =
  "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}";
const shader = (fragmentShader, uniforms = {}) =>
  new T.ShaderMaterial({
    uniforms,
    vertexShader: fullVertex,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
export async function cityRenderer(canvas, scene, camera) {
  const r = new T.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
    alpha: false,
    preserveDrawingBuffer: false,
  });
  r.outputColorSpace = T.SRGBColorSpace;
  r.toneMapping = T.ACESFilmicToneMapping;
  r.toneMappingExposure = 1;
  r.setClearColor(0x111522);
  const hdr = !!r.extensions.has("EXT_color_buffer_float"),
    options = { type: hdr ? T.HalfFloatType : T.UnsignedByteType };
  const env = await texture("environment");
  env.mapping = T.EquirectangularReflectionMapping;
  scene.environment = env;
  scene.environmentIntensity = 0.56;
  scene.fog = new T.FogExp2(0x303145, 0.0038);
  const hemi = new T.HemisphereLight(0xd9dffb, 0x6c6475, 0.64);
  scene.add(hemi);
  function sun(c, str, x, y, z) {
    const l = new T.DirectionalLight(c, str);
    l.position.set(x, y, z);
    scene.add(l);
  }
  sun(0xc9d8ff, 0.96, -26, 44, 14);
  sun(0xffb490, 1.08, 20, 21, -29);
  sun(0xb8bfff, 0.34, 2, 8, 33);
  for (const [x, y, z, col, p] of [
    [-17, 12, 6, 0xffaa76, 160],
    [13, 11, 5, 0xff8ea9, 200],
    [0, 10, -62, 0x87c6ff, 175],
    [5, 3.8, 41, 0xf32e4a, 90],
  ]) {
    const l = new T.PointLight(col, p, 40, 2);
    l.position.set(x, y, z);
    scene.add(l);
  }
  const sky = new T.Mesh(
    new T.SphereGeometry(485, 36, 16),
    new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader:
        "varying vec3 skyDir;void main(){skyDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        `
 varying vec3 skyDir;` +
        noise +
        `
 void main(){vec3 d=normalize(skyDir);float h=max(d.y,0.);float g=exp(-h*3.6);vec2 p=d.xz/(h+.22);
 float n=noise(p*1.7)*.56+noise(p*4.4+8.)*.28+noise(p*12.)*.16;
 vec3 col=mix(vec3(.009,.012,.026),vec3(.089,.076,.112),g*.84);col+=vec3(.045,.030,.046)*(n-.42)*(1.-smoothstep(.45,.95,h));gl_FragColor=vec4(col,1.);}
 `,
    }),
  );
  scene.add(sky);
  const reflection = target(1, 1, {
    ...options,
    generateMipmaps: true,
    minFilter: T.LinearMipmapLinearFilter,
  });
  const mirror = new T.PerspectiveCamera(),
    mirrorVP = new T.Matrix4(),
    look = v3(0, 0, 0),
    camDir = v3(0, 0, -1);
  const groundMat = new T.ShaderMaterial({
    uniforms: {
      water: { value: reflection.texture },
      mirrorVP: { value: mirrorVP },
      clock: { value: 0 },
    },
    vertexShader: `uniform mat4 mirrorVP;varying vec3 world;varying vec4 reflected;
 void main(){vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;reflected=mirrorVP*p;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader:
      `
 uniform sampler2D water;uniform float clock;varying vec3 world;varying vec4 reflected;
 ` +
      noise +
      `
 float line(float x,float width){return 1.-smoothstep(width,width+fwidth(x)*1.3,abs(x));}
 float localCross(float z){float d=100.;d=min(d,abs(z+149.));d=min(d,abs(z+102.));d=min(d,abs(z+61.));d=min(d,abs(z+21.));d=min(d,abs(z-20.));d=min(d,abs(z-62.));d=min(d,abs(z-101.));return d;}
 void main(){
  vec2 p=world.xz;float dist=length(cameraPosition-world);float road=step(-20.,p.x)*step(p.x,-7.5);float cross=localCross(p.y);
  road=max(road,1.-smoothstep(3.25,3.38,cross));if(p.y< -98.)road=max(road,step(7.9,p.x)*step(p.x,20.1));
  float grain=hash(floor(p*145.)),pebble=noise(p*76.),medium=noise(p*2.9),wetPatch=noise(p*.57)*.47+noise(p*1.25)*.3+noise(p*.18)*.23;
  vec2 til=vec2(p.x/1.42+mod(floor(p.y/.59),2.)*.5,p.y/.59),f=fract(til);
  float grout=1.-smoothstep(.0015,.013+min(.12,fwidth(til.x)),min(min(f.x,1.-f.x),min(f.y,1.-f.y)));
  float tileVariation=hash(floor(til));vec3 granite=mix(vec3(.032,.038,.055),vec3(.091,.086,.083),tileVariation*.75)*(.72+medium*.36);
  granite*=1.-grout*.30;vec3 tar=vec3(.025,.029,.038)*(.65+.57*medium+.38*pebble);
  vec3 base=mix(granite,tar,road);base*=.85+.18*grain+.12*pebble;
  float paint=0.;
  if(p.x>=-20.&&p.x<=-7.5){
   if(cross>5.3)paint=max(line(p.x+15.97,.047),line(p.x+12.36,.047))*step(2.6,mod(p.y+1.,7.6));
   if(cross>3.6&&cross<6.1)paint=max(paint,1.-smoothstep(.24,.28+fwidth(p.x),abs(mod(p.x+.17,1.12)-.56)));
   if(cross>6.7&&cross<7.)paint=1.;
  }
  if(cross<3.3&&(abs(p.x+5.4)<1.22||abs(p.x+22.1)<1.17))paint=max(paint,1.-smoothstep(.21,.27+fwidth(p.y),abs(mod(p.y,.94)-.47)));
  float edge=max(line(p.x+19.92,.055),line(p.x+7.52,.059))*step(4.,cross);
  float wear=(.65+.3*pebble)*smoothstep(.16,.48,medium+.16*grain);
  base=mix(base,vec3(.45,.44,.40),paint*wear);base=mix(base,vec3(.49,.33,.08),edge*wear*.64);
  vec2 drain=vec2(p.x+10.4,mod(p.y+15.,31.)-15.5);float mr=length(drain);
  if(mr<.39){float grooves=smoothstep(.34,.46,abs(fract(drain.x*28.)-.5));base=mix(vec3(.028,.03,.034),vec3(.105,.105,.102),grooves*.7+line(mr-.345,.009));}
  float wet=smoothstep(.19,.81,wetPatch);vec3 view=normalize(cameraPosition-world);float fres=pow(1.-clamp(view.y,0.,1.),3.);
  vec2 uv=reflected.xy/reflected.w*.5+.5;
  float motion=clock*.055;
  float slopes=(noise(p*vec2(3.4,8.2)+vec2(motion,0.))-.5)*.72+(noise(p*vec2(8.4,21.)-motion)-.5)*.3;
  float rip=(1.-wet*.67);uv+=vec2(slopes*.009,(noise(p*vec2(1.4,7.9))-.5)*.024+slopes*.008)*rip*min(1.,46./max(dist,1.));
  float blur=mix(4.2,.80,wet)+mix(1.35,0.,road);
  vec3 reflectedColor=texture2D(water,clamp(uv,.002,.998),blur).rgb;
  float gloss=mix(.075,.29,road)+wet*.29+fres*.135;gloss*=mix(1.-grout*.68,1.,road)*(1.-paint*.43);
  vec3 col=base*mix(.76,1.,road)+reflectedColor*gloss;
  float distanceFog=1.-exp(-dist*dist*.000012);col=mix(col,vec3(.045,.048,.073),distanceFog*.85);
  gl_FragColor=vec4(col,1.);
 }`,
  });
  const ground = new T.Mesh(new T.PlaneGeometry(640, 760), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.022;
  scene.add(ground);
  const sceneTarget = target(1, 1, options),
    glowA = target(1, 1, { ...options, depthBuffer: false }),
    glowB = target(1, 1, { ...options, depthBuffer: false });
  const passScene = new T.Scene(),
    ortho = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    surface = new T.Mesh(new T.PlaneGeometry(2, 2));
  surface.frustumCulled = false;
  passScene.add(surface);
  const bright = shader(
    `uniform sampler2D source;varying vec2 vUv;void main(){vec3 c=texture2D(source,vUv).rgb;float l=max(max(c.r,c.g),c.b);gl_FragColor=vec4(c*smoothstep(.48,1.48,l),1.);}`,
    { source: { value: sceneTarget.texture } },
  );
  const blur = shader(
    `uniform sampler2D source;uniform vec2 axis;varying vec2 vUv;void main(){vec3 s=texture2D(source,vUv).rgb*.227027;s+=(texture2D(source,vUv+axis*1.384615).rgb+texture2D(source,vUv-axis*1.384615).rgb)*.316216;s+=(texture2D(source,vUv+axis*3.230769).rgb+texture2D(source,vUv-axis*3.230769).rgb)*.070270;gl_FragColor=vec4(s,1.);}`,
    { source: { value: glowA.texture }, axis: { value: new T.Vector2() } },
  );
  const final = shader(
    `uniform sampler2D source;uniform sampler2D bloom;varying vec2 vUv;
 vec3 display(vec3 x){x=max(vec3(0.),x);return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
 void main(){vec3 c=texture2D(source,vUv).rgb+texture2D(bloom,vUv).rgb*.19;c*=1.0-.115*pow(length((vUv-.5)*1.4),2.);c=display(c*.97);c=mix(12.92*c,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));float d=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;gl_FragColor=vec4(c+d/255.,1.);}`,
    { source: { value: sceneTarget.texture }, bloom: { value: glowA.texture } },
  );
  let quality = 1,
    frame = 0,
    low = false;
  function resize() {
    const w = canvas.clientWidth,
      h = canvas.clientHeight,
      ratio = Math.min(devicePixelRatio, 1.55, 1800 / Math.max(1, w)) * quality;
    r.setPixelRatio(ratio);
    r.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const W = canvas.width,
      H = canvas.height;
    sceneTarget.setSize(W, H);
    const scale = low ? 0.38 : 0.58;
    reflection.setSize(
      Math.max(1, Math.round(W * scale)),
      Math.max(1, Math.round(H * scale)),
    );
    glowA.setSize(
      Math.max(1, Math.floor(W / 5)),
      Math.max(1, Math.floor(H / 5)),
    );
    glowB.setSize(glowA.width, glowA.height);
  }
  function pass(m, target) {
    surface.material = m;
    r.setRenderTarget(target);
    r.render(passScene, ortho);
  }
  function render(time) {
    frame++;
    groundMat.uniforms.clock.value = time;
    camera.updateMatrixWorld();
    sky.position.copy(camera.position);
    if (!low || frame % 2 === 1) {
      camera.getWorldDirection(camDir);
      look.copy(camera.position).add(camDir);
      look.y = 0.044 - look.y;
      mirror.copy(camera, false);
      mirror.position.y = 0.044 - camera.position.y;
      mirror.up.set(0, -1, 0);
      mirror.lookAt(look);
      mirror.updateMatrixWorld();
      mirrorVP.multiplyMatrices(
        mirror.projectionMatrix,
        mirror.matrixWorldInverse,
      );
      ground.visible = false;
      r.setRenderTarget(reflection);
      r.render(scene, mirror);
      ground.visible = true;
    }
    r.setRenderTarget(sceneTarget);
    r.render(scene, camera);
    pass(bright, glowA);
    blur.uniforms.source.value = glowA.texture;
    blur.uniforms.axis.value.set(1.45 / glowA.width, 0);
    pass(blur, glowB);
    blur.uniforms.source.value = glowB.texture;
    blur.uniforms.axis.value.set(0, 1.45 / glowB.height);
    pass(blur, glowA);
    pass(final, null);
  }
  function streetGlows(lights) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,253,234,1)");
    g.addColorStop(0.07, "rgba(255,232,177,.74)");
    g.addColorStop(0.2, "rgba(255,198,126,.17)");
    g.addColorStop(0.55, "rgba(255,173,117,.042)");
    g.addColorStop(1, "rgba(255,171,130,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const mat = new T.SpriteMaterial({
      map: new T.CanvasTexture(c),
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
    });
    lights.forEach(([x, y, z]) => {
      const s = new T.Sprite(mat);
      s.position.set(x, y - 0.025, z);
      s.scale.set(2.7, 2.7, 1);
      scene.add(s);
    });
  }
  resize();
  return {
    render,
    resize,
    streetGlows,
    renderer: r,
    get low() {
      return low;
    },
    lower() {
      if (quality <= 0.67) return;
      quality = Math.max(0.66, quality - 0.17);
      low = true;
      resize();
    },
  };
}
