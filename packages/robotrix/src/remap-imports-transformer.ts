import ts from 'typescript'

export interface IRemapImportsTransformerOptions {
    remapTarget(target: string, containingFile: string): string
}

/**
 * Remaps targets of esnext static or dynamic imports/re-exports.
 */
export function createRemapImportsTransformer(
    options: IRemapImportsTransformerOptions
): ts.TransformerFactory<ts.SourceFile> {
    return context => sourceFile => transformSourceFile(sourceFile, context, options)
}

function transformSourceFile(
    sourceFile: ts.SourceFile,
    context: ts.TransformationContext,
    { remapTarget }: IRemapImportsTransformerOptions
): ts.SourceFile {
    const { fileName } = sourceFile
    return ts.visitEachChild(sourceFile, visitStaticImportsExports, context)

    /**
     * Visitor for static imports/re-exports, such as:
     *
     * import {something} from 'target'
     * import * as something from 'target'
     *
     * export {something} from 'target'
     * export * from 'target'
     */
    function visitStaticImportsExports(node: ts.Node): ts.Node | ts.Node[] {
        if (
            ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
        ) {
            const originalTarget = node.moduleSpecifier.text
            const remappedTarget = remapTarget(originalTarget, fileName)
            if (originalTarget !== remappedTarget) {
                return ts.updateImportDeclaration(
                    node,
                    node.decorators,
                    node.modifiers,
                    node.importClause,
                    ts.createLiteral(remappedTarget)
                )
            }
        } else if (
            ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
        ) {
            const originalTarget = node.moduleSpecifier.text
            const remappedTarget = remapTarget(originalTarget, fileName)
            if (originalTarget !== remappedTarget) {
                return ts.updateExportDeclaration(
                    node,
                    node.decorators,
                    node.modifiers,
                    node.exportClause,
                    ts.createLiteral(remappedTarget)
                )
            }
        }

        // if not a static import/re-export, might be a dynamic import
        // so run that recursive visitor on `node`
        return visitDynamicImports(node)
    }

    /**
     * Visitor for dynamic imports, such as:
     *
     * import('target').then(...)
     */
    function visitDynamicImports(node: ts.Node): ts.Node {
        if (
            ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword &&
            node.arguments.length === 1 &&
            ts.isStringLiteral(node.arguments[0])
        ) {
            const originalTarget = (node.arguments[0] as ts.StringLiteral).text
            const remappedTarget = remapTarget(originalTarget, fileName)
            if (originalTarget !== remappedTarget) {
                return ts.updateCall(
                    node,
                    node.expression,
                    node.typeArguments,
                    [ts.createLiteral(remappedTarget)]
                )
            }
        }

        return ts.visitEachChild(node, visitDynamicImports, context)
    }
}
