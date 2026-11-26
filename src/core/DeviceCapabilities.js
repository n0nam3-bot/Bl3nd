export async function detectCapabilities() {
  const nav = globalThis.navigator || {};
  const memory = Number(nav.deviceMemory) || null;
  const threads = Number(nav.hardwareConcurrency) || 2;
  let webgpu = false;
  let adapter = null;
  if (nav.gpu?.requestAdapter) {
    try {
      adapter = await nav.gpu.requestAdapter();
      webgpu = Boolean(adapter);
    } catch { /* WebGPU can be blocked by browser policy or hardware. */ }
  }
  let webgl2 = false;
  try {
    const canvas = document.createElement('canvas');
    webgl2 = Boolean(canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }));
    canvas.width = canvas.height = 1;
  } catch { /* WebGL2 unavailable. */ }
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '') || matchMedia('(max-width: 760px)').matches;
  const tier = mobile || (memory && memory <= 4) || threads <= 4 ? 'Mobile' : 'PC';
  let storage = false;
  try { storage = Boolean(await nav.storage?.getDirectory?.()); } catch { /* OPFS is optional. */ }
  return {
    tier,
    memory,
    threads,
    webgpu,
    webgl2,
    storage,
    rendererPreference: webgpu ? 'WebGPU-capable (WebGL2 viewport active)' : webgl2 ? 'WebGL2' : 'WebGL fallback',
    workerConcurrency: tier === 'PC' ? Math.max(1, Math.min(threads - 1, 6)) : 1,
    maxUndoEntries: tier === 'PC' ? 40 : 12,
    pixelRatioCap: tier === 'PC' ? 2 : 1.35
  };
}
