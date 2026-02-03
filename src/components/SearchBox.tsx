import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { searchETFs } from '../api';
import type { ETFSearchResult } from '../api';

interface SearchBoxProps {
  onAdd: (ticker: string) => void;
  market: 'US' | 'HK';
}

export const SearchBox: React.FC<SearchBoxProps> = ({ onAdd, market }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ETFSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  
  // Custom Debounce implementation inline or imported
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedQuery(query), 500);
    return () => clearTimeout(handler);
  }, [query]);

  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchResults = async () => {
      if (!debouncedQuery) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const data = await searchETFs(debouncedQuery);
        // Filter by market if needed, but Yahoo search is global.
        // We can prioritize or filter based on suffix if user strictly wants HK/US.
        // Simple heuristic: HK stocks usually end with .HK or are numbers.
        const filtered = data.filter(item => {
          if (market === 'HK') return item.symbol.endsWith('.HK') || /^\d{4}$/.test(item.symbol);
          if (market === 'US') return !item.symbol.includes('.'); // Rough approximation
          return true;
        });
        setResults(filtered);
        setIsOpen(true);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [debouncedQuery, market]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  const handleSelect = (ticker: string) => {
    onAdd(ticker);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div className="relative">
        <input
          type="text"
          className="w-full px-4 py-2 pl-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={t('search_placeholder', { market, example: market === 'US' ? 'SPY' : '2800.HK' })}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
        />
        <Search className="absolute left-3 top-2.5 text-gray-400 w-5 h-5" />
        {loading && <Loader2 className="absolute right-3 top-2.5 text-blue-500 w-5 h-5 animate-spin" />}
      </div>

       {isOpen && results.length > 0 && (
         <ul className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto max-w-full">
          {results.map((item) => (
            <li
              key={item.symbol}
              className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex justify-between items-center"
              onClick={() => handleSelect(item.symbol)}
            >
              <div>
                <div className="font-bold">{item.symbol}</div>
                <div className="text-sm text-gray-500 truncate max-w-[10rem] sm:max-w-xs">{item.shortname || item.longname}</div>
              </div>
              <Plus className="w-4 h-4 text-blue-500" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
