import serverless from 'serverless-http';
import { createSerpApp } from '../../server/serpApp';

const app = createSerpApp({ mountRoot: true });

export const handler = serverless(app);
