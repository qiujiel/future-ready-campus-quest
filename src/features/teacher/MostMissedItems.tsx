import { useState } from "react";
import type { MissedItemAggregate } from "../../shared/api/contracts";
import { MisconceptionPanel } from "./MisconceptionPanel";

export function MostMissedItems({
  items,
}: {
  items: MissedItemAggregate[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((item) => item.itemId === selectedId);

  return (
    <section className="teacher-panel" aria-labelledby="most-missed">
      <p className="eyebrow">Instructional signals</p>
      <h2 id="most-missed">Most-missed checks</h2>
      {items.length ? (
        <ol className="missed-items">
          {items.map((item) => (
            <li key={item.itemId}>
              <div>
                <strong>{item.shortLabel}</strong>
                <span>{item.incorrectCount} of {item.responseCount} missed · {item.conceptId}</span>
              </div>
              <button
                className="quest-button quest-button--secondary"
                type="button"
                onClick={() => setSelectedId(item.itemId)}
              >
                Review {item.shortLabel} patterns
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p>No missed-item patterns are available yet.</p>
      )}
      {selected ? (
        <MisconceptionPanel
          conceptId={selected.conceptId}
          tags={selected.misconceptionTags}
        />
      ) : null}
    </section>
  );
}
