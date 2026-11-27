const EPSILON = 1e-9;

function normalize(vector) {
  if (!Array.isArray(vector) || vector.length < 3) return null;
  const length = Math.hypot(Number(vector[0]), Number(vector[1]), Number(vector[2]));
  if (!Number.isFinite(length) || length < EPSILON) return null;
  return [Number(vector[0]) / length, Number(vector[1]) / length, Number(vector[2]) / length];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function scoreDirection(direction, samples) {
  return samples.reduce((score, sample) => score + sample.weight * Math.max(0, dot(sample.normal, direction)), 0);
}

/**
 * Choose the camera-facing direction that exposes the greatest weighted area
 * of a selected set of polygon faces. The objective is the sum of each face's
 * projected area, so a multi-sided selection naturally favors a view that
 * reveals several selected planes instead of only the current front plane.
 *
 * Each sample is { normal: [x, y, z], weight?: positiveArea }.
 * The current direction is used to break equivalent-view ties and is returned
 * unchanged when the input contains no usable face normals.
 */
export function chooseSelectionViewDirection(faceSamples, currentDirection = [0, -1, 1]) {
  const current = normalize(currentDirection) || [0, -1, 1];
  const samples = (Array.isArray(faceSamples) ? faceSamples : [])
    .map(sample => {
      const normal = normalize(sample?.normal);
      const weight = Number(sample?.weight ?? 1);
      return normal && Number.isFinite(weight) && weight > 0 ? { normal, weight } : null;
    })
    .filter(Boolean);
  if (!samples.length) return current;

  const seeds = [current,
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const sampleCount = 96;
  for (let index = 0; index < sampleCount; index++) {
    const z = 1 - 2 * (index + 0.5) / sampleCount;
    const radius = Math.sqrt(Math.max(0, 1 - z * z));
    const angle = index * goldenAngle;
    seeds.push([Math.cos(angle) * radius, Math.sin(angle) * radius, z]);
  }
  // Face normals are useful seeds for flat regions and small selected patches.
  for (const sample of samples) seeds.push(sample.normal);

  let bestDirection = current;
  let bestScore = scoreDirection(current, samples);
  let bestAlignment = 1;
  const tieTolerance = Math.max(1, samples.reduce((sum, sample) => sum + sample.weight, 0)) * 1e-8;

  for (const seed of seeds) {
    let direction = normalize(seed) || current;
    // Within a fixed active hemisphere, the exact maximum is the normalized
    // weighted sum of its face normals. Iterate until the active set stabilizes.
    for (let iteration = 0; iteration < 12; iteration++) {
      const sum = [0, 0, 0];
      for (const sample of samples) {
        if (dot(sample.normal, direction) <= EPSILON) continue;
        sum[0] += sample.normal[0] * sample.weight;
        sum[1] += sample.normal[1] * sample.weight;
        sum[2] += sample.normal[2] * sample.weight;
      }
      const next = normalize(sum);
      if (!next || dot(next, direction) > 1 - 1e-11) break;
      direction = next;
    }

    const candidateScore = scoreDirection(direction, samples);
    const alignment = dot(direction, current);
    if (candidateScore > bestScore + tieTolerance
      || (Math.abs(candidateScore - bestScore) <= tieTolerance && alignment > bestAlignment)) {
      bestDirection = direction;
      bestScore = candidateScore;
      bestAlignment = alignment;
    }
  }

  return bestDirection;
}
