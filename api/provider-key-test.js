import { createNetlifyAdapter } from './_netlifyAdapter.js';
import core from './_core/provider-key-test.cjs';

export const config = {
  maxDuration: 30,
};

export default createNetlifyAdapter(core.handler);
