const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;

function subdivide(positions, indices) {
  const points = Array.from(positions), midpoint = new Map(), out = [];
  const mid = (a, b) => {
    const key = edgeKey(a,b); if (midpoint.has(key)) return midpoint.get(key);
    const id = points.length / 3;
    for (let i=0;i<3;i++) points.push((positions[a*3+i] + positions[b*3+i]) / 2);
    midpoint.set(key,id); return id;
  };
  for (let i=0;i+2<indices.length;i+=3) {
    const [a,b,c] = [indices[i],indices[i+1],indices[i+2]], ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
    out.push(a,ab,ca, ab,b,bc, ca,bc,c, ab,bc,ca);
  }
  return { positions: new Float32Array(points), indices: new Uint32Array(out) };
}

function mirror(positions, indices, modifier) {
  const axis = ({x:0,y:1,z:2})[modifier.axis || 'x'];
  const count = positions.length / 3, points = Array.from(positions), out = Array.from(indices);
  for (let i=0;i<count;i++) {
    const p = [positions[i*3],positions[i*3+1],positions[i*3+2]]; p[axis] *= -1; points.push(...p);
  }
  for (let i=0;i+2<indices.length;i+=3) out.push(indices[i]+count,indices[i+2]+count,indices[i+1]+count);
  return { positions:new Float32Array(points), indices:new Uint32Array(out) };
}

function arrayMesh(positions, indices, modifier) {
  const count = Math.max(1, Math.min(20, Math.round(Number(modifier.count) || 2)));
  const offset = Array.isArray(modifier.offset) ? modifier.offset : [2,0,0];
  const baseCount = positions.length / 3, points = [], out = [];
  for (let copy=0; copy<count; copy++) {
    for (let i=0;i<positions.length;i+=3) points.push(positions[i]+offset[0]*copy,positions[i+1]+offset[1]*copy,positions[i+2]+offset[2]*copy);
    for (const index of indices) out.push(index + baseCount*copy);
  }
  return { positions:new Float32Array(points), indices:new Uint32Array(out) };
}

function solidify(positions, indices, modifier) {
  const thickness = Number(modifier.thickness ?? 0.08), vertexCount = positions.length/3;
  const points = Array.from(positions), normals = new Float32Array(positions.length);
  for (let i=0;i+2<indices.length;i+=3) {
    const a=indices[i],b=indices[i+1],c=indices[i+2];
    const ax=positions[a*3],ay=positions[a*3+1],az=positions[a*3+2], bx=positions[b*3],by=positions[b*3+1],bz=positions[b*3+2],cx=positions[c*3],cy=positions[c*3+1],cz=positions[c*3+2];
    const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
    const n=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];
    for (const id of [a,b,c]) for(let j=0;j<3;j++) normals[id*3+j]+=n[j];
  }
  const innerOffset = points.length/3;
  for(let i=0;i<vertexCount;i++){
    const n=[normals[i*3],normals[i*3+1],normals[i*3+2]],len=Math.hypot(...n)||1;
    points.push(positions[i*3]-n[0]/len*thickness,positions[i*3+1]-n[1]/len*thickness,positions[i*3+2]-n[2]/len*thickness);
  }
  const out=Array.from(indices);
  for(let i=0;i+2<indices.length;i+=3) out.push(indices[i]+innerOffset,indices[i+2]+innerOffset,indices[i+1]+innerOffset);
  const edges=new Map();
  for(let i=0;i+2<indices.length;i+=3){const tri=[indices[i],indices[i+1],indices[i+2]];for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],key=edgeKey(a,b),e=edges.get(key)||{a,b,count:0};e.count++;edges.set(key,e);}}
  for(const e of edges.values()) if(e.count===1) out.push(e.a,e.b,e.b+innerOffset,e.a,e.b+innerOffset,e.a+innerOffset);
  return { positions:new Float32Array(points), indices:new Uint32Array(out) };
}

self.onmessage = ({ data }) => {
  try {
    let result = { positions:new Float32Array(data.positions), indices:new Uint32Array(data.indices) };
    for (const modifier of data.modifiers || []) {
      if (modifier.enabled === false) continue;
      if (modifier.type === 'subdivision') result = subdivide(result.positions, result.indices);
      else if (modifier.type === 'mirror') result = mirror(result.positions, result.indices, modifier);
      else if (modifier.type === 'array') result = arrayMesh(result.positions, result.indices, modifier);
      else if (modifier.type === 'solidify') result = solidify(result.positions, result.indices, modifier);
    }
    self.postMessage({ id:data.id, positions:result.positions, indices:result.indices }, [result.positions.buffer,result.indices.buffer]);
  } catch (error) {
    self.postMessage({ id:data.id, error:error?.message || 'Modifier evaluation failed' });
  }
};
