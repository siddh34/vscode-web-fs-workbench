import { create } from "vs/workbench/workbench.web.main";
import { URI, UriComponents } from "vs/base/common/uri";
import {
	IWorkbenchConstructionOptions,
	IWorkspace,
	IWorkspaceProvider,
} from "vs/workbench/browser/web.api";
declare const window: any;

// File System Access API types
interface FileSystemHandle {
	kind: "file" | "directory";
	name: string;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
	kind: "directory";
	getDirectoryHandle(name: string): Promise<FileSystemDirectoryHandle>;
	getFileHandle(name: string): Promise<FileSystemFileHandle>;
	values(): AsyncIterableIterator<FileSystemHandle>;
	entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

interface FileSystemFileHandle extends FileSystemHandle {
	kind: "file";
	getFile(): Promise<File>;
}

declare global {
	interface Window {
		showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
		showOpenFilePicker?: () => Promise<FileSystemFileHandle[]>;
		fileSystemAccessProvider?: any;
		vscodeApi?: any;
	}
}

(async function () {
	// create workbench
	let config: IWorkbenchConstructionOptions & {
		folderUri?: UriComponents;
		workspaceUri?: UriComponents;
		domElementId?: string;
	} = {};

	if (window.product) {
		config = window.product;
	} else {
		const result = await fetch("product.json");
		config = await result.json();
	}

	if (Array.isArray(config.additionalBuiltinExtensions)) {
		const tempConfig = { ...config };

		tempConfig.additionalBuiltinExtensions =
			config.additionalBuiltinExtensions.map((ext) => URI.revive(ext));
		config = tempConfig;
	}

	let workspace;
	if (config.folderUri) {
		workspace = { folderUri: URI.revive(config.folderUri) };
	} else if (config.workspaceUri) {
		workspace = { workspaceUri: URI.revive(config.workspaceUri) };
	} else {
		workspace = undefined;
	}

	// Enhanced workspace provider with File System Access API support
	if (workspace) {
		const workspaceProvider: IWorkspaceProvider = {
			workspace,
			open: async (
				workspace: IWorkspace,
				options?: { reuse?: boolean; payload?: { useFileSystemAPI?: boolean } }
			) => {
				// Check if File System Access API is available
				if (window.showDirectoryPicker && options?.payload?.useFileSystemAPI) {
					try {
						const directoryHandle = await window.showDirectoryPicker();
						console.log("Selected directory:", directoryHandle.name);

						// Wait for the file system provider to be available
						await waitForProvider();

						if (window.fileSystemAccessProvider) {
							window.fileSystemAccessProvider.setDirectoryHandle(
								directoryHandle
							);

							// Open the directory as workspace
							const fsAccessUri = URI.parse("fsaccess:/");
							const newWorkspace = { folderUri: fsAccessUri };

							// Reload with the new workspace
							window.location.hash = `#${JSON.stringify({
								folderUri: fsAccessUri.toJSON(),
							})}`;
							window.location.reload();
						}
					} catch (error) {
						console.error("File system access denied:", error);
					}
				}
				return true;
			},
			trusted: true,
		};
		config = { ...config, workspaceProvider };
	}

	// Helper function to wait for the FileSystemProvider to be available
	async function waitForProvider(maxWaitTime = 5000) {
		const startTime = Date.now();
		while (
			!window.fileSystemAccessProvider &&
			Date.now() - startTime < maxWaitTime
		) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		return !!window.fileSystemAccessProvider;
	}

	// Helper function to open a folder with File System Access API
	async function openDirectoryWithFSAPI() {
		if (!window.showDirectoryPicker) {
			alert("File System Access API is not supported in this browser");
			return;
		}

		try {
			const directoryHandle = await window.showDirectoryPicker();
			console.log("Selected folder:", directoryHandle.name);

			// Wait for the provider to be available
			const providerAvailable = await waitForProvider();
			if (!providerAvailable) {
				console.error("FileSystemProvider not available");
				alert("FileSystemProvider extension not loaded");
				return;
			}

			// Set the directory handle in the provider
			window.fileSystemAccessProvider.setDirectoryHandle(directoryHandle);

			// Create a new workspace configuration with fsaccess scheme
			const newConfig = {
				...config,
				folderUri: URI.parse("fsaccess:/").toJSON(),
			};

			// Update the page to load the new workspace
			const newUrl = new URL(window.location.href);
			newUrl.searchParams.set("folder", "fsaccess:/");
			window.location.href = newUrl.toString();
		} catch (error) {
			if (error.name !== "AbortError") {
				console.error("Folder selection failed:", error);
				alert("Failed to open folder: " + error.message);
			}
		}
	}

	// Helper function to open files with File System Access API
	async function openFilesWithFSAPI() {
		if (!window.showOpenFilePicker) {
			alert("File System Access API is not supported in this browser");
			return;
		}

		try {
			const fileHandles = await window.showOpenFilePicker({ multiple: true });

			for (const fileHandle of fileHandles) {
				const file = await fileHandle.getFile();
				console.log("Selected file:", file.name, file.size);

				// You could create temporary URIs for individual files
				// This would require extending the FileSystemProvider to handle individual files
			}
		} catch (error) {
			if (error.name !== "AbortError") {
				console.error("File selection failed:", error);
				alert("Failed to open files: " + error.message);
			}
		}
	}

	const domElement =
		(!!config.domElementId && document.getElementById(config.domElementId)) ||
		document.body;

	// Add file system picker buttons to the DOM
	if (window.showDirectoryPicker || window.showOpenFilePicker) {
		const pickerContainer = document.createElement("div");
		pickerContainer.style.position = "fixed";
		pickerContainer.style.top = "10px";
		pickerContainer.style.right = "10px";
		pickerContainer.style.zIndex = "9999";
		pickerContainer.style.display = "flex";
		pickerContainer.style.gap = "10px";
		pickerContainer.style.padding = "10px";
		pickerContainer.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
		pickerContainer.style.borderRadius = "5px";

		if (window.showDirectoryPicker) {
			const folderButton = document.createElement("button");
			folderButton.textContent = "Open Folder";
			folderButton.style.padding = "8px 12px";
			folderButton.style.backgroundColor = "#007acc";
			folderButton.style.color = "white";
			folderButton.style.border = "none";
			folderButton.style.borderRadius = "3px";
			folderButton.style.cursor = "pointer";
			folderButton.onclick = openDirectoryWithFSAPI;
			pickerContainer.appendChild(folderButton);
		}

		if (window.showOpenFilePicker) {
			const fileButton = document.createElement("button");
			fileButton.textContent = "Open Files";
			fileButton.style.padding = "8px 12px";
			fileButton.style.backgroundColor = "#28a745";
			fileButton.style.color = "white";
			fileButton.style.border = "none";
			fileButton.style.borderRadius = "3px";
			fileButton.style.cursor = "pointer";
			fileButton.onclick = openFilesWithFSAPI;
			pickerContainer.appendChild(fileButton);
		}

		document.body.appendChild(pickerContainer);
	}

	// Check URL parameters for folder opening
	const urlParams = new URLSearchParams(window.location.search);
	const folderParam = urlParams.get("folder");
	if (folderParam === "fsaccess:/") {
		// Set the workspace to use the fsaccess scheme
		workspace = { folderUri: URI.parse("fsaccess:/") };
		config = { ...config, folderUri: URI.parse("fsaccess:/").toJSON() };
	}

	// Create the workbench
	create(domElement, config);

	// Log when workbench is ready
	console.log(
		"VSCode Web workbench created with File System Access API support"
	);
})();
