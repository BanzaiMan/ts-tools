import ts from 'typescript'
import { TypeScriptService } from '@ts-tools/typescript-service'
import { loader } from 'webpack'
import { getOptions, getRemainingRequest } from 'loader-utils'

const externalSourceMapPrefix = `//# sourceMappingURL=`
const platformHasColors = !!ts.sys.writeOutputIsTTY && ts.sys.writeOutputIsTTY()

/**
 * Loader options which can be provided via webpack configuration
 * or a specific request query string
 */
export interface ITypeScriptLoaderOptions {
    /**
     * Expose diagnostics as webpack warnings.
     *
     * @default false exposes diagnostics as webpack errors
     */
    warnOnly?: boolean

    /**
     * Use colors when formatting diagnostics.
     *
     * @default true (if current platform supports it)
     */
    colors?: boolean

    /**
     * Keys to override in the `compilerOptions` section of the
     * `tsconfig.json` file.
     */
    compilerOptions?: object

    /**
     * Configuration file name to look for.
     *
     * @default 'tsconfig.json'
     */
    tsconfigFileName?: string
}

const NODE_MODULES_REGEX = /[/\\]node_modules[/\\]/
export const tsService = new TypeScriptService()

export const typescriptLoader: loader.Loader = function(/* source */) {
    const loaderOptions: ITypeScriptLoaderOptions = {
        colors: platformHasColors,
        warnOnly: false,
        compilerOptions: {},
        ...getOptions(this) // webpack's recommended method to parse loader options
    }
    const tsFormatFn = loaderOptions.colors ? ts.formatDiagnosticsWithColorAndContext : ts.formatDiagnostics
    const { resourcePath } = this

    // atm, the loader does not use webpack's `inputFileSystem` to create a custom language service
    // instead, it uses native node APIs (via @ts-tools/typescript-service)
    // so we use the file path directly (resourcePath) instead of the `source` passed to us
    // this also means we do not support other loaders before us
    // not ideal, but works for most use cases
    // will be changed in near future
    const { diagnostics, outputText, sourceMapText, baseHost } = tsService.transpileFile(resourcePath, {
        cwd: this.rootContext,
        getCompilerOptions: (formatHost, tsconfigOptions) => {
            const compilerOptions: ts.CompilerOptions = {
                ...tsconfigOptions,
                module: ts.ModuleKind.ESNext, // webpack supports it and we want tree shaking out of the box
            }

            if (tsconfigOptions && tsconfigOptions.module === ts.ModuleKind.CommonJS) {
                if (tsconfigOptions.esModuleInterop) {
                    // allowSyntheticDefaultImports is no longer implicitly turned on for ts<3.1
                    compilerOptions.allowSyntheticDefaultImports = true
                }
                if (!tsconfigOptions.moduleResolution) {
                    // moduleResolution is no longer implicitly set to NodeJs
                    compilerOptions.moduleResolution = ts.ModuleResolutionKind.NodeJs
                }
            } else if (!tsconfigOptions) {
                // no config was found, so assume es2017+jsx. opinionated, but can be overidden via loader options.
                compilerOptions.target = ts.ScriptTarget.ES2017
                compilerOptions.jsx = ts.JsxEmit.React
            }

            const { errors: optionsDiagnostics, options: overrideOptions } = ts.convertCompilerOptionsFromJson(
                loaderOptions.compilerOptions,
                this.rootContext
            )

            if (optionsDiagnostics.length) {
                this.emitError(new Error(tsFormatFn(optionsDiagnostics, formatHost)))
            } else {
                Object.assign(compilerOptions, overrideOptions)
            }

            // we dont accept any user overrides of sourcemap configuration
            // instead, we force external sourcemaps (with inline sources) on/off based on webpack signals.

            compilerOptions.sourceMap = compilerOptions.inlineSources = this.sourceMap
            compilerOptions.inlineSourceMap = false
            compilerOptions.mapRoot = compilerOptions.sourceRoot = undefined

            // force declarations off, as we don't have .d.ts bundling.
            // noEmit will not give us any output, so force that off.
            // output locations are irrelevant, as we bundle. this ensures source maps have proper relative paths.
            compilerOptions.declaration = compilerOptions.declarationMap = compilerOptions.noEmit = false
            compilerOptions.outDir = compilerOptions.out = compilerOptions.outFile = undefined

            return compilerOptions
        },
        tsconfigFileName: loaderOptions.tsconfigFileName,
        isolated: NODE_MODULES_REGEX.test(resourcePath)
    })

    // expose diagnostics
    if (diagnostics && diagnostics.length) {
        const transpileError = new Error(tsFormatFn(diagnostics, baseHost))
        if (loaderOptions.warnOnly) {
            this.emitWarning(transpileError)
        } else {
            this.emitError(transpileError)
        }
    }

    if (sourceMapText) {
        const rawSourceMap = JSON.parse(sourceMapText) as import ('source-map').RawSourceMap
        if (rawSourceMap.sources.length === 1) {
            rawSourceMap.sources[0] = getRemainingRequest(this)
        }
        const sourceMappingIdx = outputText.lastIndexOf(externalSourceMapPrefix)

        this.callback(null, sourceMappingIdx === -1 ? outputText : outputText.slice(0, sourceMappingIdx), rawSourceMap)
    } else {
        this.callback(null, outputText)
    }

}
