import {env} from 'cloudflare:workers';
export function workspaceDb(){if(!env.DB)throw new Error('Workspace database unavailable');return env.DB;}
