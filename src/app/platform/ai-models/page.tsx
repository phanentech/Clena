import type { Metadata } from "next";
import { Badge, Card, CardHeader, Input, Select } from "@/components/ui/primitives";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { createClient } from "@/lib/supabase/server";
import { requirePlatform } from "@/lib/auth/session";
import { addAiModel, saveAiModel, saveAiProviderKey } from "../actions";

export const metadata: Metadata = { title: "AI Models" };

const PROVIDERS: Record<string, string> = { anthropic: "Anthropic", openai: "OpenAI", google: "Google", mistral: "Mistral", meta: "Meta (Llama)", deepseek: "DeepSeek", xai: "xAI", cohere: "Cohere", qwen: "Alibaba Qwen" };

export default async function AiModelsPage() {
  await requirePlatform("ai.manage");
  const supabase = await createClient();
  const [{ data: models }, { data: plans }] = await Promise.all([
    supabase.from("ai_models").select("*").order("sort_order"),
    supabase.from("plans").select("code, name").order("sort_order"),
  ]);
  const byProvider = new Map<string, NonNullable<typeof models>>();
  (models ?? []).forEach((m) => byProvider.set(m.provider, [...(byProvider.get(m.provider) ?? []), m]));
  const enabled = (models ?? []).filter((m) => m.is_enabled).length;

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-[22px] font-semibold">AI models</h1>
        <p className="mt-1 text-[13px] text-muted">{models?.length ?? 0} models from {byProvider.size} providers, {enabled} available to businesses. Businesses only see enabled models on plans at or above the minimum plan. Prices are what you pay the provider per million tokens; check each provider&apos;s price page before you enable a model.</p>
      </div>
      {[...byProvider.entries()].map(([provider, list]) => (
        <Card key={provider}>
          <CardHeader title={PROVIDERS[provider] ?? provider} description={`${list.length} model${list.length === 1 ? "" : "s"}`} />
          <div className="divide-y divide-line">
            {list.map((m) => (
              <ActionForm key={m.id} action={saveAiModel} compact className="grid items-center gap-3 px-4 py-3 lg:grid-cols-[1.4fr_90px_90px_120px_130px_auto_auto_auto]">
                <input type="hidden" name="id" value={m.id} />
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[13px] font-semibold">{m.display_name}{m.is_default && <Badge tone="success">default</Badge>}</p>
                  <p className="truncate text-xs text-muted"><code className="text-faint">{m.model_id}</code> {m.description}</p>
                </div>
                <Input name="input_price" type="number" step="0.0001" min={0} defaultValue={m.input_price_per_mtok ?? ""} placeholder="In $/M" aria-label={`${m.display_name} input price per million tokens`} />
                <Input name="output_price" type="number" step="0.0001" min={0} defaultValue={m.output_price_per_mtok ?? ""} placeholder="Out $/M" aria-label={`${m.display_name} output price per million tokens`} />
                <Input name="context_window" type="number" min={0} defaultValue={m.context_window ?? ""} placeholder="Context" aria-label="Context window" />
                <Select name="min_plan_code" defaultValue={m.min_plan_code ?? ""} aria-label="Minimum plan">
                  <option value="">All plans</option>
                  {(plans ?? []).map((p) => <option key={p.code} value={p.code}>{p.name} and up</option>)}
                </Select>
                <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="is_enabled" defaultChecked={m.is_enabled} className="size-4 accent-navy-900" />Enabled</label>
                <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="is_default" defaultChecked={m.is_default} className="size-4 accent-navy-900" />Default</label>
                <SubmitButton size="sm" variant="outline" pendingLabel="…">Save</SubmitButton>
              </ActionForm>
            ))}
          </div>
        </Card>
      ))}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Add a model" description="Any model your providers offer, by its API model ID." />
          <ActionForm action={addAiModel} resetOnSuccess className="grid gap-3 p-4 sm:grid-cols-2">
            <Input name="provider" placeholder="Provider, e.g. openai" aria-label="Provider" />
            <Input name="model_id" placeholder="Model ID" aria-label="Model ID" />
            <Input name="display_name" placeholder="Display name" aria-label="Display name" />
            <Input name="capabilities" placeholder="chat, tools, vision" aria-label="Capabilities" />
            <div className="sm:col-span-2"><SubmitButton variant="outline" pendingLabel="Adding…">Add model</SubmitButton></div>
          </ActionForm>
        </Card>
        <Card>
          <CardHeader title="Provider API keys" description="Stored server-side only. Saving replaces the existing key." />
          <ActionForm action={saveAiProviderKey} resetOnSuccess className="grid gap-3 p-4 sm:grid-cols-2">
            <Select name="provider" defaultValue="anthropic" aria-label="Provider">
              {[...new Set([...Object.keys(PROVIDERS), ...byProvider.keys()])].map((p) => <option key={p} value={p}>{PROVIDERS[p] ?? p}</option>)}
            </Select>
            <Input name="api_key" type="password" autoComplete="off" placeholder="API key" aria-label="API key" />
            <Input name="base_url" placeholder="Base URL (optional, for gateways like OpenRouter)" aria-label="Base URL" className="sm:col-span-2" />
            <div className="sm:col-span-2"><SubmitButton variant="outline" pendingLabel="Saving…">Save key</SubmitButton></div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
