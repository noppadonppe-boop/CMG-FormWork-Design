import formTieClosureText from './reference/workflow-v07/closure/form_tie_machine_bridge.json?raw';
import ringlockClosureText from './reference/workflow-v07/closure/ringlock_component_rating_sidecar.json?raw';
import serviceabilityClosureText from './reference/workflow-v07/closure/serviceability_reference_options.json?raw';
import rulePackClosureText from './reference/workflow-v07/closure/rule_pack_manifest.json?raw';
import issueCatalogueClosureText from './reference/workflow-v07/closure/closure_issue_catalogue.json?raw';
import ringlockTemplateText from './reference/workflow-v07/closure/templates/ringlock_configuration.json?raw';
import serviceabilityTemplateText from './reference/workflow-v07/closure/templates/serviceability.json?raw';
import stageReleaseTemplateText from './reference/workflow-v07/closure/templates/stage_release.json?raw';
import supportSlabTemplateText from './reference/workflow-v07/closure/templates/support_slab.json?raw';
import supportSoilTemplateText from './reference/workflow-v07/closure/templates/support_soil.json?raw';
import {closurePackInventory, normalizeClosureFormTieBridge, normalizeClosureRinglockSidecar, parseClosureInputTemplate} from './domain/workflowV07/closurePack';

const formTie = normalizeClosureFormTieBridge(JSON.parse(formTieClosureText));
const ringlockSidecar = normalizeClosureRinglockSidecar(JSON.parse(ringlockClosureText));

/** Reference-only Closure Pack data loaded beside the existing v0.7 catalogue. */
export const closureReferences = {
  formTie,
  ringlockSidecar,
  templates: {
    ringlockConfiguration: parseClosureInputTemplate(JSON.parse(ringlockTemplateText)),
    serviceability: parseClosureInputTemplate(JSON.parse(serviceabilityTemplateText)),
    stageRelease: parseClosureInputTemplate(JSON.parse(stageReleaseTemplateText)),
    supportSlab: parseClosureInputTemplate(JSON.parse(supportSlabTemplateText)),
    supportSoil: parseClosureInputTemplate(JSON.parse(supportSoilTemplateText)),
  },
  serviceabilityOptions: JSON.parse(serviceabilityClosureText) as Record<string, unknown>,
  rulePack: JSON.parse(rulePackClosureText) as Record<string, unknown>,
  issueCatalogue: JSON.parse(issueCatalogueClosureText) as Record<string, unknown>,
  inventory: closurePackInventory(formTie, ringlockSidecar),
};
