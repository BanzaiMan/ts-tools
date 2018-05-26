import { spawnSync } from 'child_process'
import { expect } from 'chai'
import { join } from 'path'
import { platform } from 'os'

const registerPath = join(__dirname, '..', '..', 'register.js')

describe('Node TypeScript Service', () => {
    const runWithRequireHook = (tsFilePath: string) =>
        spawnSync('node', ['--require', registerPath, tsFilePath], { shell: true }).output.toString()

    describe('with tsconfig.json', () => {
        const withTsConfigProject = join(__dirname, '..', 'test-cases', 'with-tsconfig')

        it('throws on syntactic errors', () => {
            const fileWithSyntaxError = join(withTsConfigProject, 'src', 'file-with-syntax-error.ts')
            const output = runWithRequireHook(fileWithSyntaxError)

            expect(output).to.include(`Syntactic errors in ${fileWithSyntaxError}`)
            expect(output).to.include(`')' expected`)
        })

        it('throws semantic errors', () => {
            const fileWithTypeError = join(withTsConfigProject, 'src', 'file-with-type-error.ts')
            const output = runWithRequireHook(fileWithTypeError)

            expect(output).to.include(`Semantic errors in ${fileWithTypeError}`)
            expect(output).to.include(`Type '123' is not assignable to type 'string'`)
        })

        it('maps stack traces using source maps', () => {
            const fileThatThrows = join(withTsConfigProject, 'src', 'throwing.ts')
            const output = runWithRequireHook(fileThatThrows)

            expect(output).to.include(`at runMe (${fileThatThrows}:11:15)`)
        })

        it('isolates two folders with different configs', () => {
            const fileWithDescribe = join(withTsConfigProject, 'test', 'type-isolation.ts')
            const fileWithoutDescribe = join(withTsConfigProject, 'src', 'type-isolation.ts')

            const withDescribeOutput = runWithRequireHook(fileWithDescribe)
            const withoutDescribeOutput = runWithRequireHook(fileWithoutDescribe)

            expect(withDescribeOutput).to.not.include(`Semantic errors in ${fileWithDescribe}`)
            expect(withoutDescribeOutput).to.include(`Semantic errors in ${fileWithoutDescribe}`)
            expect(withoutDescribeOutput).to.include(`Cannot find name 'describe'`)
        })

    })

    describe('no tsconfig.json', () => {
        const noTsConfigProject = join(__dirname, '..', 'test-cases', 'no-tsconfig')

        it('maps stack traces using source maps', () => {
            const fileThatThrows = join(noTsConfigProject, 'throwing.ts')
            const output = runWithRequireHook(fileThatThrows)

            expect(output).to.include(`at runMe (${fileThatThrows}:9:11)`)
        })

        it('allows using imports', () => {
            const fileThatThrows = join(noTsConfigProject, 'imports.ts')
            const output = runWithRequireHook(fileThatThrows)

            expect(output).to.include(`Current platform is: ${platform()}`)
        })
    })
})
