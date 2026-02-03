import React, { useState } from 'react';
import type { AnalysisResult } from '../api';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

interface Props {
  data: AnalysisResult;
}

export const OverlapMatrix: React.FC<Props> = ({ data }) => {
  const { t } = useTranslation();
  const { overlap_matrix, tickers, etf_info } = data;
  const [selectedCell, setSelectedCell] = useState<{i: number, j: number} | null>(null);

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">{t('matrix.title')}</h2>
      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="min-w-full border-collapse text-xs sm:text-sm">
          <thead>
            <tr>
              <th className="p-2 sm:p-3 border-b bg-gray-50"></th>
              {tickers.map(t => (
                <th key={t} className="p-2 sm:p-3 border-b bg-gray-50 text-gray-700">
                  <div className="font-bold">{t}</div>
                  <div className="text-xs font-normal text-gray-500 truncate max-w-[120px] sm:max-w-[150px]" title={etf_info[t]?.shortname}>{etf_info[t]?.shortname}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {overlap_matrix.map((row, i) => (
              <tr key={i}>
                <th className="p-2 sm:p-3 border-b bg-gray-50 text-left text-gray-700">
                  <div className="font-bold">{tickers[i]}</div>
                </th>
                {row.map((cell, j) => {
                  const isDiag = i === j;
                  const bgStyle = {
                    backgroundColor: isDiag ? '#f3f4f6' : `rgba(59, 130, 246, ${Math.max(0.1, cell.weight)})`,
                    color: !isDiag && cell.weight > 0.5 ? 'white' : 'black'
                  };
                  
                  return (
                    <td 
                      key={j} 
                      className={clsx(
                        "p-2 sm:p-3 border text-center transition-all",
                        !isDiag && "cursor-pointer hover:ring-2 hover:ring-blue-500 hover:z-10 relative"
                      )}
                      style={bgStyle}
                      onClick={() => !isDiag && setSelectedCell({i, j})}
                      title={!isDiag ? t('matrix.click_hint') : ''}
                    >
                      {(cell.weight * 100).toFixed(1)}%
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedCell && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedCell(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  {t('matrix.modal.title')}
                </h3>
                <p className="text-gray-500 mt-1">
                  {tickers[selectedCell.i]} <span className="mx-2">vs</span> {tickers[selectedCell.j]}
                </p>
              </div>
              <button 
                onClick={() => setSelectedCell(null)} 
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-6 bg-blue-50 p-4 rounded-lg">
               <div>
                 <p className="text-sm text-gray-500">{t('matrix.modal.weight')}</p>
                 <p className="text-2xl font-bold text-blue-600">{(overlap_matrix[selectedCell.i][selectedCell.j].weight * 100).toFixed(2)}%</p>
               </div>
               <div>
                 <p className="text-sm text-gray-500">{t('matrix.modal.common_stocks')}</p>
                 <p className="text-2xl font-bold text-blue-600">{overlap_matrix[selectedCell.i][selectedCell.j].count} <span className="text-sm font-normal text-gray-500">{t('matrix.modal.count_unit')}</span></p>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-semibold text-gray-600">{t('matrix.modal.symbol')}</th>
                    <th className="text-left p-3 font-semibold text-gray-600">{t('matrix.modal.name')}</th>
                    <th className="text-right p-3 font-semibold text-gray-600">{t('matrix.modal.weight_in', { ticker: tickers[selectedCell.i] })}</th>
                    <th className="text-right p-3 font-semibold text-gray-600">{t('matrix.modal.weight_in', { ticker: tickers[selectedCell.j] })}</th>
                  </tr>
                </thead>
                <tbody>
                  {overlap_matrix[selectedCell.i][selectedCell.j].common.length > 0 ? (
                    overlap_matrix[selectedCell.i][selectedCell.j].common
                      .sort((a,b) => (b.weight_a + b.weight_b) - (a.weight_a + a.weight_b))
                      .map((item, idx) => (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                        <td className="p-3 font-mono text-gray-600">{item.symbol}</td>
                        <td className="p-3 font-medium text-gray-900">{item.name}</td>
                        <td className="p-3 text-right">{(item.weight_a * 100).toFixed(2)}%</td>
                        <td className="p-3 text-right">{(item.weight_b * 100).toFixed(2)}%</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-gray-500">
                        {t('matrix.modal.no_common')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
