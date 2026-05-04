import { createNetlifyAdapter } from './_netlifyAdapter.js';
import core from './_core/library-list.cjs';

export const config = {
  maxDuration: 300,
};

export default createNetlifyAdapter(core.handler);
