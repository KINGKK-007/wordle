import { useState, useCallback, useRef } from 'react';
import { isRecord, readJson, writeStorage } from '../utils/storage';

function matchesShape<T>(value: unknown, initial: T): value is T {
  if (typeof value !== typeof initial || value === null) return false;
  if (Array.isArray(initial)) return Array.isArray(value);
  if (isRecord(initial)) {
    return isRecord(value) && Object.keys(initial).every(key => matchesShape(value[key], initial[key]));
  }
  return typeof value !== 'number' || Number.isFinite(value);
}

export function useLocalStorage<T>(key: string, initialValue: T, validate?: (value: unknown) => value is T) {
  const [storedValue, setStoredValue] = useState<T>(() =>
    readJson(key, validate ?? ((value): value is T => matchesShape(value, initialValue))) ?? initialValue
  );
  const valueRef = useRef(storedValue);
  const setValue = useCallback((value: T | ((val: T) => T)) => {
    const next = typeof value === 'function' ? (value as (val: T) => T)(valueRef.current) : value;
    valueRef.current = next;
    setStoredValue(next);
    writeStorage(key, JSON.stringify(next));
  }, [key]);
  return [storedValue, setValue] as const;
}
