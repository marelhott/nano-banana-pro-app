import { createServerlessAdapter } from './_serverlessAdapter.js';
import core from './_core/provider-generate.cjs';

export const config = {
  maxDuration: 300,
};

export default createServerlessAdapter(core.handler);
