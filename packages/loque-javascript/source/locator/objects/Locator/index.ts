// #region imports
    // #region libraries
    import util from 'util';
    // #endregion libraries


    // #region external
    import Scanner from '../Scanner';
    import Token from '../Token';
    import Parser from '../Parser';

    import {
        TokenType,
    } from '../../data/enumerations';

    import {
        LocatorStatements,
    } from '../Statement';
    // #endregion external
// #endregion imports



// #region module
class Locator {
    private hadError = false;

    /**
     * Parse `locator` data.
     *
     * @param data
     * @param options
     */
    public parse(
        data: string,
    ) {
        const scanner = new Scanner(
            data,
            this.error,
        );
        const tokens = scanner.scanTokens();
        // console.log('tokens', tokens);

        const parser = new Parser(
            tokens,
            this.error,
        );
        const statements = parser.parse();
        // console.log('statements', util.inspect(statements, {showHidden: false, depth: null}));

        if (this.hadError) {
            throw 'loque error';
        }

        return statements as LocatorStatements;
    }

    /**
     * Log error.
     *
     * @param entity
     * @param message
     */
    private error(
        entity: number | Token,
        message: string,
    ) {
        if (typeof entity === 'number') {
            // entity is a line number
            this.report(entity, '', message);
            return;
        }

        // entity is a Token
        if (entity.type === TokenType.EOF) {
            this.report(entity.line, ' at end', message);
        } else {
            this.report(entity.line, " at '" + entity.lexeme + "'", message);
        }
    }

    /**
     * Logs to console a static error.
     *
     * @param line
     * @param where
     * @param message
     */
    private report(
        line: number,
        where: string,
        message: string,
    ) {
        const value = 'Locator :: [line ' + line + '] Error' + where + ': ' + message;
        console.log(value);

        this.hadError = true;
    }
}
// #endregion module



// #region exports
export default Locator;
// #endregion exports
