import { extname, isAbsolute, resolve } from 'node:path'

export const FPS = 30
export const SIZE = Object.freeze({ width: 1920, height: 1080 })

export function pictureArguments(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) ||
      Object.keys(plan).sort().join(',') !== 'frames,kind,output,plates' ||
      !['hold', 'dissolve'].includes(plan.kind) || !Number.isSafeInteger(plan.frames) ||
      plan.frames < 1 || plan.frames > 18000 || !Array.isArray(plan.plates) ||
      plan.plates.length !== (plan.kind === 'hold' ? 1 : 2) ||
      typeof plan.output !== 'string' || !isAbsolute(plan.output) ||
      extname(plan.output) !== '.mp4' || !plan.plates.every(plate =>
        typeof plate === 'string' && isAbsolute(plate) && extname(plate) === '.png' &&
        resolve(plate) !== resolve(plan.output))) {
    throw new Error('INVALID_PICTURE_PLAN')
  }
  const base = ['-n', '-hide_banner', '-loglevel', 'error',
    '-filter_complex_threads', '1', '-filter_threads', '1']
  const encode = ['-an', '-c:v', 'libx264', '-preset', 'fast', '-tune', 'stillimage',
    '-crf', '18', '-threads', '2', '-r', String(FPS), '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-g', '60', '-keyint_min', '60', '-sc_threshold', '0', '-video_track_timescale', '15360']
  const convert = 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p,setsar=1,' +
    'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709'
  const inputs = plan.plates.flatMap(plate => ['-loop', '1', '-framerate', String(FPS),
    '-protocol_whitelist', 'file,pipe', '-i', plate])
  const filter = plan.kind === 'hold' ? ['-vf', convert] : ['-filter_complex',
    `[0:v]format=gbrp[a];[1:v]format=gbrp[b];[a][b]blend=all_expr=` +
    `'A*(1-N/${plan.frames})+B*N/${plan.frames}',${convert}[v]`, '-map', '[v]']
  return [...base, ...inputs, ...filter, '-frames:v', String(plan.frames), ...encode, plan.output]
}