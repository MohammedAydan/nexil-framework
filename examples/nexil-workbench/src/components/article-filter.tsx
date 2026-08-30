import { computed, state } from 'nexil'

export function ArticleFilter() {
  const active = state(false)
  const inactive = computed(() => !active())
  return (
    <section aria-labelledby="filter-title">
      <h2 id="filter-title">Filter articles</h2>
      <button aria-pressed={active()} onClick$={() => active.set(!active())}>
        Toggle release-ready filter
      </button>
      <p bindHidden$={active}>Showing every article.</p>
      <p bindHidden$={inactive}>Showing release-ready articles.</p>
    </section>
  )
}
