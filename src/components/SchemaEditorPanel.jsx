import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Copy, ArrowRightLeft, Database } from 'lucide-react';
import { DATA_TYPE_PRESETS, generateSchemaSql } from '../utils/structuredElements';
import { createId } from '../utils/storage';

export default function SchemaEditorPanel({
  schema,
  allSchemas = [],
  relations = [],
  onChange,
  onClose,
  onStartConnect,
  onCopySql,
}) {
  if (!schema) return null;

  const fields = Array.isArray(schema.fields) ? schema.fields : [];

  const updateField = (fieldId, patch) => {
    const nextFields = fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f));
    onChange({ ...schema, fields: nextFields });
  };

  const addField = () => {
    const nextFields = [
      ...fields,
      {
        id: createId(),
        name: `column_${fields.length + 1}`,
        type: 'varchar',
        isPK: false,
        isFK: false,
        isNullable: false,
        isUnique: false,
      },
    ];
    onChange({ ...schema, fields: nextFields });
  };

  const removeField = (fieldId) => {
    onChange({ ...schema, fields: fields.filter((f) => f.id !== fieldId) });
  };

  const handleCopy = () => {
    const sql = generateSchemaSql(schema, allSchemas, relations);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(sql).then(() => onCopySql?.());
    } else {
      onCopySql?.(sql);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="sp-schema-inspector"
        initial={{ opacity: 0, x: 18, scale: 0.98 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 18, scale: 0.98 }}
        transition={{ duration: 0.16 }}
        role="dialog"
        aria-label="Edit schema table"
      >
        <div className="sp-schema-inspector-head">
          <div className="sp-schema-title-wrap">
            <Database size={15} style={{ color: schema.color || 'var(--accent)', flexShrink: 0 }} />
            <input
              type="text"
              className="sp-schema-name-input"
              value={schema.name || ''}
              placeholder="table_name"
              onChange={(e) => onChange({ ...schema, name: e.target.value })}
              aria-label="Schema table name"
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              type="button"
              className="sp-mini-btn"
              onClick={handleCopy}
              title="Copy SQL CREATE TABLE"
              aria-label="Copy SQL CREATE TABLE"
            >
              <Copy size={13} />
            </button>
            <button
              type="button"
              className="sp-mini-btn"
              onClick={onClose}
              title="Done editing (Esc)"
              aria-label="Close schema editor"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="sp-schema-fields-list">
          {fields.map((field) => (
            <div key={field.id} className="sp-schema-field-row">
              <input
                type="text"
                className="sp-schema-col-input"
                value={field.name}
                placeholder="column"
                onChange={(e) => updateField(field.id, { name: e.target.value })}
                aria-label="Column name"
              />
              <input
                type="text"
                list="sp-sql-types"
                className="sp-schema-type-input"
                value={field.type}
                placeholder="type"
                onChange={(e) => updateField(field.id, { type: e.target.value })}
                aria-label="Column data type"
              />
              <div className="sp-schema-badges">
                <button
                  type="button"
                  className={`sp-badge-toggle pk ${field.isPK ? 'active' : ''}`}
                  onClick={() => updateField(field.id, { isPK: !field.isPK })}
                  title="Primary Key"
                >
                  PK
                </button>
                <button
                  type="button"
                  className={`sp-badge-toggle fk ${field.isFK ? 'active' : ''}`}
                  onClick={() => updateField(field.id, { isFK: !field.isFK })}
                  title="Foreign Key"
                >
                  FK
                </button>
                <button
                  type="button"
                  className={`sp-badge-toggle ${!field.isNullable ? 'active' : ''}`}
                  onClick={() => updateField(field.id, { isNullable: !field.isNullable })}
                  title="Not Null"
                >
                  NN
                </button>
                <button
                  type="button"
                  className={`sp-badge-toggle ${field.isUnique ? 'active' : ''}`}
                  onClick={() => updateField(field.id, { isUnique: !field.isUnique })}
                  title="Unique"
                >
                  UQ
                </button>
              </div>
              <button
                type="button"
                className="sp-mini-btn danger"
                onClick={() => removeField(field.id)}
                title="Remove column"
                aria-label="Remove column"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}

          <datalist id="sp-sql-types">
            {DATA_TYPE_PRESETS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>

        <div className="sp-schema-inspector-foot">
          <button
            type="button"
            className="sp-btn"
            style={{ height: 28, fontSize: 12 }}
            onClick={addField}
          >
            <Plus size={13} />
            Add Column
          </button>
          <button
            type="button"
            className="sp-btn sp-btn-primary"
            style={{ height: 28, fontSize: 12 }}
            onClick={() => onStartConnect(schema.id)}
            title="Click another schema table to connect"
          >
            <ArrowRightLeft size={13} />
            Connect
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
