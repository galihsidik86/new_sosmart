-- Dokumen projek (tautan) di level projek & per milestone/tugas.
ALTER TABLE "projects"
  ADD COLUMN "link_dokumen" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "project_tasks"
  ADD COLUMN "link_dokumen" TEXT[] NOT NULL DEFAULT '{}';
