-- One-row counter so scheduled 404 cleanup can see the 10,000 cap
-- without scanning _emdash_404_log. D1's COUNT(*) visits every row.
CREATE TABLE IF NOT EXISTS ptg_404_cardinality (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  row_count INTEGER NOT NULL
);

CREATE TRIGGER IF NOT EXISTS ptg_404_cardinality_insert
AFTER INSERT ON _emdash_404_log
BEGIN
  UPDATE ptg_404_cardinality SET row_count = row_count + 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS ptg_404_cardinality_delete
AFTER DELETE ON _emdash_404_log
BEGIN
  UPDATE ptg_404_cardinality
  SET row_count = CASE WHEN row_count > 0 THEN row_count - 1 ELSE 0 END
  WHERE id = 1;
END;

INSERT INTO ptg_404_cardinality (id, row_count)
SELECT 1, (SELECT COUNT(*) FROM _emdash_404_log)
WHERE NOT EXISTS (SELECT 1 FROM ptg_404_cardinality WHERE id = 1);
