import { createNetlifyAdapter } from './_netlifyAdapter.js';
import core from './_core/r2-presign.cjs';

export const config = {
  maxDuration: 30,
};

export default createNetlifyAdapter(core.handler);
