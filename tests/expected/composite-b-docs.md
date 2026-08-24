# useQuery

The `useQuery` hook fetches, caches, and updates data in your components. It accepts a key, a fetcher function, and an options object, and returns the current state of the request together with helpers for refetching and invalidation whenever your inputs change.

Note

Keys must be stable across renders.

## Usage

```bash
npm install datafetch
```

Then wire it up:

```tsx
const { data, error } = useQuery(['todos'], fetchTodos);
```

## Options

| Option | Type | Default |
| --- | --- | --- |
| `retry` | `number \| boolean` | `3` |
| `staleTime` | `number` | `0` |

> Set `staleTime` to `Infinity` for immutable data.
