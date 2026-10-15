import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import { ResourceDraft, type ResourceData } from './resourceDraft';

/** 订阅资源草稿；编辑时同步写入会话，避免 blur/切页早于 React render。 */
export function useResourceDraft(session: ResourceDraft, onSaved?: (data: ResourceData) => void) {
  const [, render] = useReducer(value => value + 1, 0);
  const savedRef = useRef(onSaved);
  savedRef.current = onSaved;
  useLayoutEffect(() => {
    session.onChange = render;
    session.onSaved = data => savedRef.current?.(data);
    return () => { session.onChange = undefined; session.onSaved = undefined; };
  }, [session]);
  const revision = session.revision;
  useEffect(() => {
    if (!session.dirty) return;
    const timer = setTimeout(() => { void session.flush(); }, 2000);
    return () => clearTimeout(timer);
  }, [session, revision]);
  return session.data;
}
