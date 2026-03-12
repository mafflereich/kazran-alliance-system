import { useState } from 'react';
import { supabase } from '@/shared/api/supabase';

export interface TableDiffSummary {
  tableName: string;
  primaryKey: string;
  addCount: number;
  updateCount: number;
  deleteCount: number;
  idsToDelete: any[];
  recordsToUpsert: any[];
}

export function useRestoreDiff() {
  const [isDiffing, setIsDiffing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [diffSummary, setDiffSummary] = useState<TableDiffSummary[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const calculateDiff = async (jsonData: Record<string, any[]>) => {
    setIsDiffing(true);
    try {
      const summary: TableDiffSummary[] = [];

      for (const [tableName, importRecords] of Object.entries(jsonData)) {
        if (!Array.isArray(importRecords)) continue;

        // Fetch current records
        const { data: currentRecords, error } = await supabase.from(tableName).select('*');
        if (error) {
          console.error(`Error fetching ${tableName}:`, error);
          continue; // Skip tables that don't exist or have errors
        }

        // Determine primary key (id or uid)
        let primaryKey = 'id';
        const sampleRecord = importRecords[0] || currentRecords?.[0];
        if (sampleRecord && !('id' in sampleRecord) && ('uid' in sampleRecord)) {
          primaryKey = 'uid';
        }

        const currentMap = new Map(currentRecords?.map(r => [r[primaryKey], r]) || []);
        const importMap = new Map(importRecords.map(r => [r[primaryKey], r]));

        const idsToDelete: any[] = [];
        const recordsToUpsert: any[] = [];
        let addCount = 0;
        let updateCount = 0;

        // Find deletes
        for (const [key, record] of currentMap.entries()) {
          if (!importMap.has(key)) {
            idsToDelete.push(key);
          }
        }

        // Find adds and updates
        for (const [key, record] of importMap.entries()) {
          if (!currentMap.has(key)) {
            addCount++;
            recordsToUpsert.push(record);
          } else {
            // Compare objects (simple stringify comparison)
            const currentRecord = currentMap.get(key);
            if (JSON.stringify(currentRecord) !== JSON.stringify(record)) {
              updateCount++;
              recordsToUpsert.push(record);
            }
          }
        }

        summary.push({
          tableName,
          primaryKey,
          addCount,
          updateCount,
          deleteCount: idsToDelete.length,
          idsToDelete,
          recordsToUpsert
        });
      }

      setDiffSummary(summary);
      setIsModalOpen(true);
    } catch (error) {
      console.error("Diff calculation failed:", error);
      throw error;
    } finally {
      setIsDiffing(false);
    }
  };

  const executeRestore = async () => {
    setIsRestoring(true);
    try {
      for (const tableDiff of diffSummary) {
        const { tableName, primaryKey, idsToDelete, recordsToUpsert } = tableDiff;

        if (idsToDelete.length > 0) {
          const chunkSize = 100;
          for (let i = 0; i < idsToDelete.length; i += chunkSize) {
            const chunk = idsToDelete.slice(i, i + chunkSize);
            const { error } = await supabase.from(tableName).delete().in(primaryKey, chunk);
            if (error) throw error;
          }
        }

        if (recordsToUpsert.length > 0) {
          const chunkSize = 100;
          for (let i = 0; i < recordsToUpsert.length; i += chunkSize) {
            const chunk = recordsToUpsert.slice(i, i + chunkSize);
            const { error } = await supabase.from(tableName).upsert(chunk);
            if (error) throw error;
          }
        }
      }
      setIsModalOpen(false);
      setDiffSummary([]);
    } catch (error) {
      console.error("Restore execution failed:", error);
      throw error;
    } finally {
      setIsRestoring(false);
    }
  };

  const cancelRestore = () => {
    setIsModalOpen(false);
    setDiffSummary([]);
  };

  return {
    isDiffing,
    isRestoring,
    diffSummary,
    isModalOpen,
    calculateDiff,
    executeRestore,
    cancelRestore
  };
}
