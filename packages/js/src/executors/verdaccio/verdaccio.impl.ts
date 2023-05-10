import { ExecutorContext, detectPackageManager } from '@nx/devkit';
import { VerdaccioExecutorSchema } from './schema';
import { ChildProcess, execSync, fork } from 'child_process';

let childProcess: ChildProcess;

/**
 * - set npm and yarn to use local registry
 * - start verdaccio
 * - stop local registry when done
 */
export async function verdaccioExecutor(
  options: VerdaccioExecutorSchema,
  context: ExecutorContext
) {
  try {
    const packageManager = detectPackageManager(context.root);
    let registryPath;
    if (packageManager === 'yarn') {
      registryPath = execSync('yarn config get registry')?.toString();
      execSync(`yarn config set registry http://localhost:${options.port}/`);
    } else {
      registryPath = execSync(
        `npm config get registry --location ${options.location}`
      )?.toString();
      execSync(
        `npm config set registry http://localhost:${options.port}/ --location ${options.location}`
      );
    }

    const processExitListener = (signal?: number | NodeJS.Signals) => {
      if (childProcess) {
        childProcess.kill(signal);
      }
      if (packageManager === 'yarn') {
        if (registryPath) {
          execSync(`yarn config set registry ${registryPath}`);
        } else {
          execSync(`yarn config delete registry`);
        }
      } else {
        if (registryPath) {
          execSync(
            `npm config set ${registryPath} --location ${options.location}`
          );
        } else {
          execSync(`npm config delete registry --location ${options.location}`);
        }
      }
    };
    process.on('exit', processExitListener);
    process.on('SIGTERM', processExitListener);
    process.on('SIGINT', processExitListener);
    process.on('SIGHUP', processExitListener);

    await startVerdaccio(options);
  } catch (e) {
    return {
      success: false,
    };
  }
  return {
    success: true,
  };
}

/**
 * Fork the verdaccio process: https://verdaccio.org/docs/verdaccio-programmatically/#using-fork-from-child_process-module
 */
function startVerdaccio(options: VerdaccioExecutorSchema) {
  return new Promise((resolve, reject) => {
    childProcess = fork(
      require.resolve('verdaccio/bin/verdaccio'),
      createVerdaccioOptions(options),
      {
        env: {
          ...process.env,
          VERDACCIO_HANDLE_KILL_SIGNALS: 'true',
          ...(options.storage
            ? { VERDACCIO_STORAGE_PATH: options.storage }
            : {}),
        },
      }
    );

    childProcess.on('error', (err) => {
      reject(err);
    });
    childProcess.on('disconnect', (err) => {
      reject(err);
    });
    childProcess.on('exit', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(code);
      }
    });
  });
}

function createVerdaccioOptions(options: VerdaccioExecutorSchema) {
  const verdaccioArgs: string[] = [];
  if (options.port) {
    verdaccioArgs.push('--listen', options.port.toString());
  }
  if (options.config) {
    verdaccioArgs.push('--config', options.config);
  }
  return verdaccioArgs;
}

export default verdaccioExecutor;
