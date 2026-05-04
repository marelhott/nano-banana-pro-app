import { createNetlifyAdapter } from '../_netlifyAdapter.js';
import core from '../_core/fal-lora-img2img.cjs';

export const config = {
  maxDuration: 300,
};

export default createNetlifyAdapter(core.handler);
