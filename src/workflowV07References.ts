// Owner-supplied source data. Standard JSON imports also work in the Node MCP
// build; Project Example must not pull Vite-only ?raw specifiers into domain code.
import sections from './reference/workflow-v07/sections.json' with {type:'json'};
import materials from './reference/workflow-v07/materials.json' with {type:'json'};
import ringlock from './reference/workflow-v07/ringlock.json' with {type:'json'};
import checks from './reference/workflow-v07/checks.json' with {type:'json'};
import research from './reference/workflow-v07/ringlock-research-2026-10-15.json' with {type:'json'};
import type {RinglockResearchData} from './domain/workflowV07/ringlockResearch.js';
import {referenceRows} from './domain/workflowV07/catalogues.js';
import {record} from './domain/workflowV07/common.js';

export const references = {
  sections: referenceRows(sections, 'sections'),
  materials: referenceRows(materials, 'materials'),
  ringlock: referenceRows(ringlock, 'components'),
  checks: checks.map(record),
  ringlockResearch: research as RinglockResearchData,
  ringlockResearchSha256: '7ce08c7280340a1ab748746bb7a973cf3724fb66bdf7def1d1a9e3b5b0800a13',
};
