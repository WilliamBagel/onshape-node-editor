import { OnshapeNode } from "./onshapenode";
import { OnshapeInput } from "../inputoutput/onshapeinput";
import { OnshapeSocket } from "../onshapesockets";
import { ContextType } from "../../onshape-utils/featurescripttypes";
import { NodeFeaturescriptInfo } from "../../onshape-utils/featurestudiogenerator";

export class OutputFeatureNode extends OnshapeNode {

    constructor() {
        super("output-feature");
        this.addDefaultInputs();
    }

    private addDefaultInputs(): void {
        // Context argument
        const contextInput = new OnshapeInput<ContextType>(
            new OnshapeSocket('Context'),
            "Context",
            "Context",
            { type: "Context", value: "Context" }
        );
        this.addInput("context", contextInput);
    }

    public getFeatureScriptInfo(variableMapping: Record<string, string>): NodeFeaturescriptInfo {
        return {
            line: "});",
            preindent: -1,
            postindent: 0,
        };
    }

    public getTitle(): string {
        return "End Feature";
    }
}
