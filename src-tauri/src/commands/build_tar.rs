use crate::utils::tee_writer::TeeWriter;
use brotli::CompressorWriter;
use data_encoding::HEXLOWER;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io;
use std::path::Path;

fn build_tar_io(file_name: String, root_dir: String, files: Vec<String>) -> io::Result<String> {
    let file = File::create(file_name)?;

    let brotli = CompressorWriter::new(file, 4096, 11, 20);
    let hasher = Sha256::new();
    let tee = TeeWriter::new(brotli, hasher);

    let mut archive = tar::Builder::new(tee);
    archive.follow_symlinks(true);

    let root_dir = Path::new(&root_dir);

    for x in files {
        let abs_path = root_dir.join(&x);
        eprintln!("adding file '{}' with name '{}'", abs_path.display(), &x);
        archive.append_path_with_name(&abs_path, &x)?
    }

    let tee = archive.into_inner()?;
    let (_, hasher) = tee.into_inner();
    Ok(HEXLOWER.encode(hasher.finalize().as_ref()))
}

#[tauri::command]
pub fn build_tar(
    file_name: String,
    root_dir: String,
    files: Vec<String>,
) -> Result<String, String> {
    build_tar_io(file_name, root_dir, files).map_err(|e| format!("Could not build archive: {e}"))
}
