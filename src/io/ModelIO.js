import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href=url; anchor.download=filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url),1500);
}
function extension(name) { return (name.split('.').pop() || '').toLowerCase(); }

export class ModelIO {
  constructor(document, notify) { this.document=document; this.notify=notify; }

  async importFile(file) {
    const ext = extension(file.name); let imported;
    if (ext === 'obj') imported = new OBJLoader().parse(await file.text());
    else if (ext === 'stl') imported = new THREE.Mesh(new STLLoader().parse(await file.arrayBuffer()),new THREE.MeshStandardMaterial({color:0xc8cbd0,roughness:0.65}));
    else if (ext === 'glb' || ext === 'gltf') {
      const loader = new GLTFLoader();
      const data = ext === 'gltf' ? await file.text() : await file.arrayBuffer();
      const base = file.name.includes('/') ? file.name.slice(0,file.name.lastIndexOf('/')+1) : '';
      const gltf = await new Promise((resolve,reject) => loader.parse(data,base,resolve,reject));
      imported = gltf.scene;
    } else throw new Error('Choose a .glb, .gltf, .obj, or .stl file.');
    imported.updateMatrixWorld(true);
    const created=[];
    imported.traverse(child => {
      if (!child.isMesh || !child.geometry?.getAttribute('position')) return;
      const geometry=child.geometry.clone(); geometry.applyMatrix4(child.matrixWorld);
      const material=Array.isArray(child.material) ? child.material[0]?.clone?.() : child.material?.clone?.();
      const name=child.name || file.name.replace(/\.[^.]+$/,'');
      created.push(this.document.addMeshFromGeometry(geometry,name,new THREE.Vector3(),material));
      geometry.dispose();
    });
    if (!created.length) throw new Error('No polygon mesh was found in this file.');
    this.notify?.(`Imported ${created.length} mesh${created.length===1?'':'es'} from ${file.name}`,'success');
    return created;
  }

  async exportFile(format='glb') {
    const group=this.document.content; if (!this.document.objects.length) throw new Error('Add or import a mesh before exporting.');
    let blob,filename;
    if (format === 'glb' || format === 'gltf') {
      const exporter=new GLTFExporter();
      const result=await new Promise((resolve,reject)=>exporter.parse(group,resolve,reject,{binary:format==='glb',onlyVisible:true,trs:false}));
      blob=format==='glb' ? new Blob([result],{type:'model/gltf-binary'}) : new Blob([JSON.stringify(result,null,2)],{type:'model/gltf+json'});
      filename=`forge-export.${format}`;
    } else if (format === 'obj') {
      blob=new Blob([new OBJExporter().parse(group)],{type:'text/plain'}); filename='forge-export.obj';
    } else if (format === 'stl') {
      const output=new STLExporter().parse(group,{binary:true});
      blob=new Blob([output],{type:'model/stl'}); filename='forge-export.stl';
    } else throw new Error('Unsupported export format.');
    downloadBlob(blob,filename); this.notify?.(`Exported ${filename}`,'success');
  }
}
