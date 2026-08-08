// The entire client-side footprint of an article detail page. articles/[id]
// is otherwise a pure server-rendered page with no script at all — this
// island exists solely to record "this article has been visited" and
// renders nothing, so it never touches the reading content itself.
import { useEffect } from 'react';
import { getArticlesRead, setArticlesRead } from '@/lib/storage';

export function ReadMarker({ id }: { id: string }): null {
  useEffect(() => {
    const read = getArticlesRead();
    if (!read.includes(id)) setArticlesRead([...read, id]);
  }, [id]);

  return null;
}
