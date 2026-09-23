import { categoryCatalog } from "@/modules/catalog/categories";

export function CategorySelect({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="mb-3.5">
      <label htmlFor={id} className="block text-[0.75rem] font-semibold text-text-secondary mb-1">Category <span className="font-normal">(required)</span></label>
      <select id={id} name="category" value={value} required onChange={(event) => onChange(event.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-text-primary text-[0.82rem] font-body outline-none transition-colors focus:border-accent cursor-pointer">
        <option value="" disabled>Choose a category</option>
        {(["IndieTools categories", "Website types"] as const).map((group) => (
          <optgroup key={group} label={group}>
            {categoryCatalog.filter((category) => category.group === group).map((category) => (
              <option key={category.slug} value={category.slug}>{category.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <p className="text-[0.68rem] text-text-muted mt-1.5">Choose the closest match. Public sites also appear in their category leaderboard.</p>
    </div>
  );
}
