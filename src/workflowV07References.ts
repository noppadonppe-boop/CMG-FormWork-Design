// Copied byte-for-byte from the owner-supplied v0.7 archive. Lazy-loaded with the preview panel.
import sectionsText from './reference/workflow-v07/sections.json?raw';
import materialsText from './reference/workflow-v07/materials.json?raw';
import ringlockText from './reference/workflow-v07/ringlock.json?raw';
import checksText from './reference/workflow-v07/checks.json?raw';
import ringlockResearchText from './reference/workflow-v07/ringlock-research-2026-10-15.json?raw';
import type {RinglockResearchData} from './domain/workflowV07/ringlockResearch';
import {referenceRows} from './domain/workflowV07/catalogues';
import {record} from './domain/workflowV07/common';

export const references = {
  sections: referenceRows(JSON.parse(sectionsText), 'sections'),
  materials: referenceRows(JSON.parse(materialsText), 'materials'),
  ringlock: referenceRows(JSON.parse(ringlockText), 'components'),
  checks: (JSON.parse(checksText) as unknown[]).map(record),
  ringlockResearch: JSON.parse(ringlockResearchText) as RinglockResearchData,
  ringlockResearchSha256: '7ce08c7280340a1ab748746bb7a973cf3724fb66bdf7def1d1a9e3b5b0800a13',
};
