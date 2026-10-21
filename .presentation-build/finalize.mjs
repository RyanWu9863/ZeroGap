import fs from 'node:fs/promises';
process.env.RUNTIME_NODE_MODULES='C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const SKILL='C:/Users/User/.codex/plugins/cache/openai-primary-runtime/presentations/26.1020.11127/skills/presentations';
const {finalizePresentation}=await import(`file:///${SKILL}/container_tools/artifact_tool_utils.mjs`);
await fs.mkdir('D:/ZeroGap/reports',{recursive:true});
const owners=[7,9,14,17,19,20];
const result=await finalizePresentation({
 workspaceDir:'D:/ZeroGap',candidatePath:'D:/ZeroGap/.presentation-build/candidate.pptx',
 finalPath:'D:/ZeroGap/reports/ZeroGap_初步報告_20頁含講者備註.pptx',
 pythonExecutable:'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',
 integrityValidatorPath:`${SKILL}/container_tools/inspect_presentation_package_integrity.py`,
 layoutValidatorPath:`${SKILL}/container_tools/inspect_presentation_layout_geometry.py`,
 explicitTotalSlideCount:20,
 layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit',...owners.flatMap(x=>['--require-native-table-slide',String(x)])],
 requiredNativeTableOwnerSlides:owners,requiredNativeChartOwnerSlides:[],
 fontPolicy:{basis:'design',families:['Microsoft JhengHei']},
 verifyArtifactToolImport:true,receiptPath:'D:/ZeroGap/.presentation-build/validation.json'
});
console.log(JSON.stringify(result));
