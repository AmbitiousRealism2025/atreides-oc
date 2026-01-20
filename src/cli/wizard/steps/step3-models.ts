import { select, confirm } from "@inquirer/prompts";
import { printStep, COLORS, ICONS } from "../prompts.js";
import { DEFAULT_AGENTS, AVAILABLE_MODELS, type AgentConfig } from "../types.js";

export interface Step3Result {
  agents: AgentConfig[];
}

export async function runStep3ModelConfiguration(): Promise<Step3Result> {
  printStep(3, 5, "Model Configuration");
  
  console.log(`${ICONS.robot} Configure AI models for agents\n`);
  console.log(`${COLORS.dim}Each agent has a recommended model based on its purpose.`);
  console.log(`You can customize these based on your OpenCode model availability.${COLORS.reset}\n`);
  
  const agents = [...DEFAULT_AGENTS];
  
  displayAgentTable(agents);
  
  const wantToCustomize = await confirm({
    message: "Would you like to customize any agent models?",
    default: false,
  });
  
  if (wantToCustomize) {
    await customizeAgentModels(agents);
  }
  
  console.log(`\n${COLORS.green}${ICONS.success}${COLORS.reset} Model configuration complete`);
  
  return { agents };
}

function displayAgentTable(agents: AgentConfig[]): void {
  console.log(`${COLORS.dim}${"─".repeat(70)}${COLORS.reset}`);
  console.log(`  ${COLORS.bold}Agent${COLORS.reset}                    ${COLORS.bold}Purpose${COLORS.reset}                        ${COLORS.bold}Model${COLORS.reset}`);
  console.log(`${COLORS.dim}${"─".repeat(70)}${COLORS.reset}`);
  
  for (const agent of agents) {
    const nameCol = agent.displayName.padEnd(22);
    const purposeCol = agent.purpose.substring(0, 28).padEnd(30);
    const modelCol = agent.selectedModel;
    
    const isRecommended = agent.selectedModel === agent.recommendedModel;
    const modelDisplay = isRecommended 
      ? `${modelCol} ${COLORS.dim}(rec)${COLORS.reset}`
      : `${COLORS.yellow}${modelCol}${COLORS.reset}`;
    
    console.log(`  ${nameCol}${COLORS.dim}${purposeCol}${COLORS.reset}${modelDisplay}`);
  }
  
  console.log(`${COLORS.dim}${"─".repeat(70)}${COLORS.reset}\n`);
}

async function customizeAgentModels(agents: AgentConfig[]): Promise<void> {
  let continueCustomizing = true;
  
  while (continueCustomizing) {
    const agentToModify = await select({
      message: "Select agent to modify",
      choices: [
        ...agents.map(agent => ({
          name: `${agent.displayName} (${agent.selectedModel})`,
          value: agent.name,
          description: agent.purpose,
        })),
        {
          name: `${COLORS.dim}Done - finish configuration${COLORS.reset}`,
          value: "__done__",
        },
      ],
    });
    
    if (agentToModify === "__done__") {
      continueCustomizing = false;
      continue;
    }
    
    const agent = agents.find(a => a.name === agentToModify)!;
    
    const newModel = await select({
      message: `Select model for ${agent.displayName}`,
      choices: AVAILABLE_MODELS.map(model => ({
        name: model.value === agent.recommendedModel
          ? `${model.label} ${COLORS.green}(Recommended)${COLORS.reset}`
          : model.label,
        value: model.value,
        description: model.description,
      })),
      default: agent.selectedModel,
    });
    
    agent.selectedModel = newModel;
    
    console.log(`\n${COLORS.green}${ICONS.success}${COLORS.reset} Updated ${agent.displayName} to use ${newModel}\n`);
    
    displayAgentTable(agents);
  }
}
